"""Opt-in, no-network cost preflight for future CoMind-controlled API calls.

This is an estimate, not ChatGPT Work credits. The caller supplies its own
verified USD rates and conservative output cap. This module never calls an API.
"""
from __future__ import annotations
from decimal import Decimal

MILLION = Decimal('1000000')


def estimate_api_request(messages: list[dict], encoding, output_cap: int,
                         input_usd_per_million: str, output_usd_per_million: str,
                         budget_usd: str):
    if not isinstance(output_cap, int) or output_cap < 0:
        raise ValueError('output_cap must be a nonnegative integer')
    for m in messages:
        if not isinstance(m, dict) or not isinstance(m.get('role'), str) or not isinstance(m.get('content'), str):
            raise ValueError('only simple text messages supported by this preflight')
    input_tokens = sum(len(encoding.encode(m['role'])) +
                       len(encoding.encode(m['content'])) + 3 for m in messages) + 3
    ir = Decimal(input_usd_per_million)
    outr = Decimal(output_usd_per_million)
    budget = Decimal(budget_usd)
    if any(not val.is_finite() or val < 0 for val in (ir, outr, budget)):
        raise ValueError('Rates and budget must be finite and nonnegative')
    est = Decimal(input_tokens) * ir / MILLION
    reserved_output = Decimal(output_cap) * outr / MILLION
    total = est + reserved_output
    return {
        'estimated_input_tokens':input_tokens,
        'reserved_output_tokens':output_cap,
        'estimated_input_usd':str(est),
        'reserved_output_usd':str(reserved_output),
        'estimated_total_usd':str(total),
        'authorized_budget_usd':str(budget),
        'decision':'WITHIN_ESTIMATE' if total <= budget else 'BLOCK_ESTIMATE_EXCEEDS_BUDGET',
        'limitations': [
            'This assumes text-only requests and explicitly supplied rates.',
            'The API may count additional framing and tool/schema data not included here.',
            'The output limit must be enforced separately by the actual provider call.',
            'Retries, tool fees, dynamic routing, and Work credits are not covered.',
            'No real spend ceiling is enforced by this standalone estimation function.'
        ]}
