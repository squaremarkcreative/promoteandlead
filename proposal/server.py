"""Local proposal only. Serves an explicit set of public files; never loads secrets."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote
import mimetypes, json, sqlite3, os
from datetime import datetime, timezone
from contextlib import closing
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
STATE_PATH = Path(os.environ.get('PL_PREVIEW_STATE_PATH', str(ROOT/'.state'/'teaching.sqlite3')))
CURRICULUM = json.loads((ROOT/'curriculum.json').read_text())['modules']
VALID_KEYS = {t['key']+':'+str(i) for m in CURRICULUM for t in m['tasks'] for i,_ in enumerate(t['teaching']['sections'])}
def connection():
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(STATE_PATH, timeout=5)
    db.execute('CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY, revision INTEGER, state TEXT, updated TEXT)')
    return db
def valid_state(s):
    if not isinstance(s,dict) or set(s)!={'module','task','section','finished','done'}: return False
    if any(type(s[k]) is not int for k in ('module','task','section')): return False
    if not 0<=s['module']<len(CURRICULUM): return False
    tasks=CURRICULUM[s['module']]['tasks']
    if not 0<=s['task']<len(tasks) or not 0<=s['section']<len(tasks[s['task']]['teaching']['sections']): return False
    return type(s['finished']) is bool and isinstance(s['done'],dict) and all(k in VALID_KEYS and v is True for k,v in s['done'].items())
class Handler(BaseHTTPRequestHandler):
    def json_response(self, status, data):
        self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(json.dumps(data).encode())
    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == '/api/preview/teaching':
            try:
                with closing(connection()) as db, db: row=db.execute('SELECT revision,state,updated FROM progress WHERE id=1').fetchone()
                self.json_response(200, {'revision':row[0], 'state':json.loads(row[1]), 'updated':row[2]} if row else {'revision':0,'state':None})
            except sqlite3.Error: self.json_response(503, {'error':'Progress storage unavailable'})
            return
        public = {'/mountain-crisp-v4.png': ROOT/'mountain-crisp-v4.png', '/mountain-sculpted-v4.png': ROOT/'mountain-sculpted-v4.png', '/leadership-mountain-v3.png': ROOT/'leadership-mountain-v3.png', '/leadership-sculpture-v2.png': ROOT/'leadership-sculpture-v2.png', '/': ROOT/'index.html', '/index.html': ROOT/'index.html', '/style.css': ROOT/'style.css', '/app.js': ROOT/'app.js', '/curriculum.json': ROOT/'curriculum.json', '/current/': REPO/'index.html', '/current/classroom/': REPO/'classroom/index.html', '/classroom': REPO/'classroom/index.html', '/classroom/': REPO/'classroom/index.html'}
        if path == '/api/classroom/me':
            self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(b'{"signedIn":false}'); return
        file = public.get(path)
        if path.startswith('/assets/'):
            candidate=(REPO/path.lstrip('/')).resolve()
            if candidate.is_relative_to(REPO/'assets') and candidate.suffix.lower() in ('.png','.jpg','.jpeg','.svg','.webp','.ico'): file=candidate
        if not file or not file.is_file(): self.send_error(404); return
        data=file.read_bytes()
        if path.startswith('/current/') or path.startswith('/classroom'):
            # Disable requests from comparison pages, including analytics and email forms.
            data=data.replace(b'<head>', b'<head><script>window.fetch=async function(url){return new Response(JSON.stringify(String(url).includes("/me")?{signedIn:false}:{error:"Read-only local comparison. Use the proposal tabs to explore."}),{status:String(url).includes("/me")?200:403,headers:{"Content-Type":"application/json"}})};</script>',1)
        self.send_response(200); self.send_header('Content-Type',mimetypes.guess_type(file.name)[0] or 'application/octet-stream'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        if self.path != '/api/preview/teaching': self.send_error(405); return
        host=self.headers.get('Host','')
        if host not in ('127.0.0.1:4173','localhost:4173') or self.headers.get('Origin')!='http://'+host:
            self.json_response(403, {'error':'Same-origin preview requests only'}); return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=24000 or self.headers.get('Content-Type','').split(';')[0]!='application/json': raise ValueError()
            payload=json.loads(self.rfile.read(length))
            if not isinstance(payload,dict) or type(payload.get('revision')) is not int or not valid_state(payload.get('state')): raise ValueError()
        except (ValueError,TypeError): self.json_response(400, {'error':'Invalid teaching progress'}); return
        try:
            with closing(connection()) as db, db:
                db.execute('BEGIN IMMEDIATE')
                row=db.execute('SELECT revision FROM progress WHERE id=1').fetchone()
                revision=row[0] if row else 0
                if payload['revision']!=revision:
                    self.json_response(409, {'error':'Another browser updated this guide. Reload to resume its latest position.'}); return
                stamp=datetime.now(timezone.utc).isoformat()
                db.execute('INSERT OR REPLACE INTO progress VALUES(1,?,?,?)',(revision+1,json.dumps(payload['state']),stamp))
            self.json_response(200, {'revision':revision+1,'updated':stamp})
        except sqlite3.Error: self.json_response(503, {'error':'Progress could not be saved'})
if __name__ == '__main__':
    print('Proposal preview: http://127.0.0.1:4173', flush=True)
    ThreadingHTTPServer(('127.0.0.1',4173),Handler).serve_forever()
