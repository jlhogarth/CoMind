"""Offline, explicitly bounded historical ChatGPT conversation analysis.

No network I/O and no OpenAI inference calls. For exact encoding counts, pip install tiktoken.
Estimates for chat framing and replay are NOT authoritative Work usage.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_MESSAGES = 10000
MAX_CHARS_PER_MESSAGE = 2_000_000


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def sha256(raw: bytes):
    return hashlib.sha256(raw).hexdigest()


def _text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        parts = content.get('parts')
        if isinstance(parts, list):
            return '\n'.join(p if isinstance(p, str) else json.dumps(p, ensure_ascii=False, sort_keys=True)
                             for p in parts if p is not None)
        for k in ('text', 'result', 'content'):
            if k in content:
                return _text_content(content[k])
        return json.dumps(content, ensure_ascii=False, sort_keys=True)
    if isinstance(content, list):
        return '\n'.join(_text_content(p) for p in content)
    return '' if content is None else str(content)


def _chatgpt_export_messages(record: dict) -> list[dict]:
    mapping = record.get('mapping', {})
    if not isinstance(mapping, dict):
        raise ValueError('mapping must be an object')
    current = record.get('current_node')
    if current and current in mapping:
        nodes = []
        visited = set()
        while current and current in mapping and current not in visited:
            visited.add(current)
            node = mapping[current]
            if isinstance(node, dict):
                nodes.append(node)
                current = node.get('parent')
            else:
                break
        nodes.reverse()
    else:
        # Branch ambiguity explicitly disclosed. No arbitrary tree path inferred.
        raise ValueError('ChatGPT export requires a valid current_node to resolve the active branch')
    msgs = []
    for node in nodes:
        m = node.get('message')
        if not isinstance(m, dict):
            continue
        author = m.get('author') or {}
        role = author.get('role', 'unknown') if isinstance(author, dict) else 'unknown'
        recipient = m.get('recipient')
        if role == 'assistant' and recipient not in (None, 'all'):
            role = 'assistant_tool_call'
        content = _text_content(m.get('content'))
        # Some non-text or empty messages are not meaningful for text token analysis.
        if not content:
            continue
        msgs.append({'role': str(role), 'content': content,
                     'timestamp': m.get('create_time'), 'message_id': m.get('id')})
    return msgs


def normalize(raw: bytes, selection: int = 0) -> dict:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError('File exceeds 25 MB local safety limit')
    data = json.loads(raw)
    if isinstance(data, list) and data and all(isinstance(x, dict) and 'mapping' in x for x in data):
        if not 0 <= selection < len(data):
            raise ValueError('Selection is outside available conversation indices')
        rec = data[selection]
        msgs = _chatgpt_export_messages(rec)
        meta = {'title': rec.get('title', 'Untitled'), 'selection': selection,
                'available_conversations': len(data), 'format': 'chatgpt_export'}
    elif isinstance(data, dict) and 'mapping' in data:
        msgs = _chatgpt_export_messages(data)
        meta = {'title': data.get('title', 'Untitled'), 'selection': 0,
                'available_conversations': 1, 'format': 'chatgpt_export'}
    else:
        if isinstance(data, dict):
            msgs = data.get('messages')
            meta = {'title': data.get('title', 'Uploaded conversation'),
                    'selection': 0, 'available_conversations': 1, 'format': 'simple_messages'}
        elif isinstance(data, list):
            msgs = data
            meta = {'title': 'Uploaded conversation', 'selection': 0,
                    'available_conversations': 1, 'format': 'simple_messages'}
        else:
            raise ValueError('Expected a messages list or ChatGPT export JSON')
        if not isinstance(msgs, list):
            raise ValueError('messages must be a list')
        msgs = [{'role': str(x.get('role', 'unknown')),
                 'content': _text_content(x.get('content')),
                 'timestamp': x.get('timestamp'), 'message_id': x.get('id')}
                for x in msgs if isinstance(x, dict)]
    if not msgs:
        raise ValueError('No visible text messages found')
    if len(msgs) > MAX_MESSAGES:
        raise ValueError('Message count exceeds local safety limit')
    if any(len(m['content']) > MAX_CHARS_PER_MESSAGE for m in msgs):
        raise ValueError('A message exceeds 2 million characters')
    return {'meta': meta, 'messages': msgs, 'file_sha256': sha256(raw), 'bytes': len(raw)}


def encoding_instance(encoding_name='o200k_base'):
    try:
        import tiktoken
    except ImportError as ex:
        raise RuntimeError('tiktoken not installed. Run: python -m pip install tiktoken') from ex
    try:
        return tiktoken.get_encoding(encoding_name)
    except Exception as ex:
        raise RuntimeError(f'Encoding {encoding_name} unavailable locally; no fallback used') from ex


def token_counts(state: dict, encoding) -> dict:
    messages = state['messages']
    rows = []
    for i, m in enumerate(messages, start=1):
        body = len(encoding.encode(m['content']))
        role = len(encoding.encode(m['role']))
        # Explicitly approximate Chat Completions-style overhead, NOT Work framing.
        overhead = 3
        rows.append({'n': i, 'role': m['role'], 'body_tokens': body,
                     'role_tokens': role, 'framing_estimate': overhead,
                     'estimated_serialized_tokens': body + role + overhead,
                     'characters': len(m['content']), 'timestamp': m['timestamp']})
    return {'message_count': len(rows), 'visible_body_tokens': sum(r['body_tokens'] for r in rows),
            'estimated_framing_tokens': sum(r['role_tokens'] + r['framing_estimate'] for r in rows) + 3,
            'visible_output_tokens': sum(r['body_tokens'] for r in rows if r['role'] == 'assistant'),
            'tool_visible_tokens': sum(r['body_tokens'] for r in rows
                                       if r['role'] in ('tool', 'assistant_tool_call')),
            'roles': dict(Counter(r['role'] for r in rows)),
            'rows': rows, 'encoding': 'o200k_base' if encoding.name == 'o200k_base' else encoding.name}


def replay_scenarios(tokens: dict) -> dict:
    """Models cumulative full-history replay up to each user message and optionally tool messages.
    This is a scenario, NOT actual invocation count, prefill, cached tokens, or billed Work usage.
    """
    rows = tokens['rows']
    out = {}
    for scenario, triggers in (
        ('user_turn_only', {'user'}),
        ('user_plus_tool_returns', {'user', 'tool'}),
    ):
        cumulative = 0
        calls = []
        for r in rows:
            cumulative += r['estimated_serialized_tokens']
            if r['role'] in triggers:
                calls.append({'at_message': r['n'], 'modeled_input_tokens': cumulative + 3})
        out[scenario] = {'modeled_invocations': len(calls),
                         'modeled_input_tokens': sum(x['modeled_input_tokens'] for x in calls),
                         'max_context_tokens': max((x['modeled_input_tokens'] for x in calls), default=0),
                         'calls': calls}
    return out


def contributors(tokens: dict) -> dict:
    rows = tokens['rows']
    ranked = sorted(rows, key=lambda r: r['body_tokens'], reverse=True)
    return {'top_15': ranked[:15], 'by_role': {
        role: {'messages': sum(1 for r in rows if r['role'] == role),
               'visible_body_tokens': sum(r['body_tokens'] for r in rows if r['role'] == role)}
        for role in sorted({r['role'] for r in rows})
    }}


def report(state: dict, counts: dict, replay: dict, largest: dict, credits: float | None) -> dict:
    return {'generated_at': now_iso(), 'source': state['meta'], 'source_sha256': state['file_sha256'],
            'source_bytes': state['bytes'], 'reported_work_credits': credits,
            'counts': {k:v for k,v in counts.items() if k != 'rows'},
            'replay_scenarios': replay, 'contributors': largest,
            'limitations': [
                'Visible export content is not the complete internal ChatGPT Work execution trace.',
                'tiktoken encoding and per-message framing are estimates for Work/Astra.',
                'Context replay scenarios do not include hidden tool/schema payloads, private reasoning, caching, or truncation.',
                'Actual Work credits cannot be derived from public API token rates.',
                'Missing tool messages and conversation branches may affect completeness.',
                'No inference call or Work billing operation was made by this analyzer.'
            ]}
