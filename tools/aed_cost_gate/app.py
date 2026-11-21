"""Local click-to-approve forensic workflow. Standard library HTTP server only.

Binding is restricted to 127.0.0.1. Each POST approves exactly one action.
Audit log stores metadata only; never stores transcript contents.
"""
from __future__ import annotations

import html
import json
import secrets
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

from analyzer import (MAX_UPLOAD_BYTES, normalize, encoding_instance, token_counts,
                      replay_scenarios, contributors, report, now_iso)

ROOT = Path(__file__).resolve().parent
AUDIT = ROOT / 'execution_audit.jsonl'
STEPS = ['Validate import', 'Count visible tokens', 'Model input replay scenarios',
         'Rank largest contributors', 'Prepare evidence report']

class Workflow:
    def __init__(self):
        self.lock = threading.RLock()
        self.raw = None
        self.name = ''
        self.selection = 0
        self.stage = 0
        self.state = {}
        self.results = []
        self.error = ''
        self.csrf = secrets.token_urlsafe(32)
        self.report = None
        self.credits = None
        self.audit('session_started', 'no external API calls permitted')

    def audit(self, event, details):
        with AUDIT.open('a', encoding='utf-8') as f:
            f.write(json.dumps({'at':now_iso(), 'event': event, 'details': details}) + '\n')

    def reset(self, raw, filename, selection, credits):
        if len(raw) > MAX_UPLOAD_BYTES:
            raise ValueError('File is larger than 25 MB')
        # Validate JSON, but do not perform full analysis until approved.
        json.loads(raw)
        self.raw = raw
        self.name = filename
        self.selection = selection
        self.credits = credits
        self.stage = 0
        self.state = {}
        self.results = []
        self.report = None
        self.error = ''
        self.audit('file_selected', {'filename': filename, 'bytes':len(raw),
                                    'index':selection, 'reported_work_credits':credits})

    def advance(self):
        if self.raw is None or self.stage >= len(STEPS):
            raise ValueError('No pending step')
        step = self.stage
        if step == 0:
            self.state = normalize(self.raw, self.selection)
            result = {'file_sha256':self.state['file_sha256'], 'bytes':self.state['bytes'],
                      'title':self.state['meta']['title'], 'format':self.state['meta']['format'],
                      'messages':len(self.state['messages'])}
        elif step == 1:
            counts = token_counts(self.state, encoding_instance())
            self.state['counts'] = counts
            result = {k:v for k,v in counts.items() if k != 'rows'}
        elif step == 2:
            replay = replay_scenarios(self.state['counts'])
            self.state['replay'] = replay
            result = {k:{n:v for n,v in x.items() if n != 'calls'} for k,x in replay.items()}
        elif step == 3:
            largest = contributors(self.state['counts'])
            self.state['largest'] = largest
            result = {'top_15':largest['top_15'], 'by_role':largest['by_role']}
        elif step == 4:
            self.report = report(self.state, self.state['counts'],
                                 self.state['replay'], self.state['largest'], self.credits)
            result = {'status':'report_ready', 'credits':self.credits,
                      'limitations':self.report['limitations']}
        else:
            raise ValueError('Invalid step')
        self.stage += 1
        self.results.append(result)
        self.error = ''
        self.audit('approved_step_completed', {'step':step+1, 'name':STEPS[step],
                                              'result':result if step != 3 else
                                              {'top_message_numbers':[x['n'] for x in result['top_15']]}})

W = Workflow()

CSS = '''<style>body{margin:0;background:#0b1323;color:#ecf3ff;font:16px system-ui,sans-serif}
main{max-width:920px;margin:35px auto;padding:0 20px}h1{font-size:2rem}h2{font-size:1.35rem}
small,.muted{color:#9eacc9}.card{background:#15223a;border:1px solid #34506e;border-radius:13px;padding:20px;margin:18px 0}
button{background:#30c3cb;color:#071a24;padding:12px 18px;font-weight:bold;border:0;border-radius:9px;cursor:pointer}
button:hover{background:#65eced}input{margin:8px 0;padding:9px;background:#fff;color:#071a24;border-radius:5px}
pre{overflow:auto;max-height:450px;background:#071324;padding:15px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.bad{color:#ffadad}.ok{color:#7fe5aa}.pill{border-radius:20px;padding:4px 11px;background:#263951}
</style>'''


def page():
    with W.lock:
        current = W.stage
        cards = [f'<h1>CoMind AED Cost Gate</h1><p class="muted">Offline historical analysis. Each step requires a click. No AI requests, browser automation or Supabase writes.</p>']
        cards.append('<div class="card"><h2>1. Select conversation export</h2>'
                     '<form action="/upload" method="post" enctype="multipart/form-data">'
                     f'<input type="hidden" name="csrf" value="{W.csrf}">'
                     '<p><input name="file" type="file" accept=".json,application/json" required></p>'
                     '<p>Conversation index for ChatGPT export array (0 = first): '
                     '<input name="index" type="number" value="0" min="0"></p>'
                     '<p>Reported Work credits (optional): '
                     '<input name="credits" type="number" min="0" step="0.01" placeholder="190"></p>'
                     '<button type="submit">Load file locally</button></form>'
                     '<p class="muted">Supports ChatGPT export JSON and simple {"messages": [...]}. Maximum 25 MB. Only file metadata is logged.</p></div>')
        if W.raw is not None:
            cards.append(f'<div class="card"><h2>2. Approval-controlled steps</h2><p>Selected: {html.escape(W.name)} '
                         f'({len(W.raw):,} bytes). Completed: <strong>{current}/{len(STEPS)}</strong>.</p>')
            for i, name in enumerate(STEPS):
                flag = '✓ COMPLETED' if i < current else ('NEXT' if i == current else 'LOCKED')
                cards.append(f'<p><span class="pill">{flag}</span> {i+1}. {html.escape(name)}</p>')
            if current < len(STEPS):
                cards.append('<p class="ok">Preflight: 0 API calls; 0 model input tokens queued; 0 model output tokens queued; 0 Work credits intentionally requested. Local analysis only.</p>')
                cards.append(f'<form method="post" action="/approve"><input type="hidden" name="csrf" value="{W.csrf}">'
                             f'<button type="submit">Approve and run ONLY step {current+1}: {html.escape(STEPS[current])}</button></form>')
            else:
                cards.append('<p class="ok">All steps completed. JSON report is available below.</p>')
            cards.append('</div>')
            if W.error:
                cards.append('<div class="card bad">Step blocked: '+html.escape(W.error)+'</div>')
            if W.results:
                i = len(W.results)-1
                txt = html.escape(json.dumps(W.results[i], indent=2, ensure_ascii=False))
                cards.append(f'<div class="card"><h2>Last result: {html.escape(STEPS[i])}</h2><pre>{txt}</pre>'
                             '<p class="muted">Inspect this result before approving the next step.</p></div>')
            if W.report is not None:
                cards.append('<div class="card"><h2>Evidence package</h2><p><a href="/report" style="color:#78dce6">Save JSON report</a></p></div>')
        cards.append('<p class="muted">All calculations occur on this device. Server binds to 127.0.0.1 only. '
                     'A local audit file records approvals and statistics, never transcript text. '
                     'Actual Work credit allocation within a conversation is not exposed by this tool.</p>')
        return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AED Cost Gate</title>'+CSS+'<main>'+''.join(cards)+'</main></html>'


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, typ='text/html; charset=utf-8'):
        b = body.encode('utf-8') if isinstance(body,str) else body
        self.send_response(code)
        self.send_header('Content-Type',typ)
        self.send_header('Content-Length',str(len(b)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == '/':
            self._send(200,page())
        elif self.path == '/report':
            with W.lock:
                if W.report is None:
                    self._send(404, 'Report not ready', 'text/plain')
                else:
                    self._send(200, json.dumps(W.report,indent=2,ensure_ascii=False), 'application/json')
        else:
            self._send(404, 'Not found','text/plain')

    def do_POST(self):
        length = int(self.headers.get('Content-Length','0'))
        if length < 1 or length > MAX_UPLOAD_BYTES + 100000:
            self._send(413,'Payload is too large or missing', 'text/plain')
            return
        if self.path == '/approve':
            raw = self.rfile.read(length).decode('utf-8', errors='replace')
            fields = parse_qs(raw)
            with W.lock:
                if fields.get('csrf',[''])[0] != W.csrf:
                    self._send(403,'Invalid approval token','text/plain')
                    return
                try:
                    W.advance()
                except Exception as ex:
                    W.error = str(ex)
                    W.audit('step_blocked', {'step':W.stage+1,'error':W.error})
        elif self.path == '/upload':
            # cgi module is available in Python <= 3.12; Python 3.13 requires multipart alternative.
            ct = self.headers.get('Content-Type','')
            if 'multipart/form-data' not in ct:
                self._send(400,'Expected multipart/form-data','text/plain')
                return
            from email.parser import BytesParser
            from email.policy import default
            data = self.rfile.read(length)
            envelope = BytesParser(policy=default).parsebytes(
                b'Content-Type: '+ct.encode()+b'\r\nMIME-Version: 1.0\r\n\r\n'+data)
            fields = {}
            for part in envelope.iter_parts():
                name = part.get_param('name',header='content-disposition')
                if name:
                    fields[name] = (part.get_filename(),part.get_payload(decode=True))
            with W.lock:
                if fields.get('csrf',(None,b''))[1].decode('utf-8',errors='replace') != W.csrf:
                    self._send(403,'Invalid approval token','text/plain')
                    return
                try:
                    filename, raw = fields['file']
                    idx = int(fields.get('index',(None,b'0'))[1].decode())
                    c = fields.get('credits',(None,b''))[1].decode().strip()
                    credits = float(c) if c else None
                    if credits is not None and (credits < 0 or credits > 100000000):
                        raise ValueError('Invalid credits value')
                    W.reset(raw, filename or 'conversation.json', idx, credits)
                except Exception as ex:
                    W.error = str(ex)
                    W.audit('import_blocked', W.error)
        else:
            self._send(404,'Not found','text/plain')
            return
        self.send_response(303)
        self.send_header('Location','/')
        self.send_header('Content-Length','0')
        self.end_headers()

    def log_message(self,*args):
        pass


def main():
    port=8765
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print(f'AED Cost Gate: http://127.0.0.1:{port} (Ctrl+C to stop)')
    server.serve_forever()

if __name__=='__main__':
    main()
