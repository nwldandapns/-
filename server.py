#!/usr/bin/env python3
import json, os, random, sqlite3, string, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOST=os.environ.get('RUSHSTARS_HOST','0.0.0.0')
PORT=int(os.environ.get('PORT',os.environ.get('RUSHSTARS_PORT','8787')))
# Cloud hosts usually provide PORT. Local/VPS defaults to 8787.
DB_PATH=os.environ.get('RUSHSTARS_DB','rushstars.db')
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)),exist_ok=True)
LOCK=threading.RLock()
ROOMS={}
TOKENS={}
INVITES={}


def db():
    c=sqlite3.connect(DB_PATH,check_same_thread=False)
    c.row_factory=sqlite3.Row
    return c


def init_db():
    with db() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS players(
            player_id TEXT PRIMARY KEY,
            device_id TEXT UNIQUE NOT NULL,
            nickname TEXT NOT NULL,
            trophies INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS friends(
            a TEXT NOT NULL,
            b TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(a,b)
        )''')


def make_id(prefix,n=8):
    chars=string.ascii_uppercase+string.digits
    return prefix+'-'+''.join(random.choice(chars) for _ in range(n))


def auth(token):
    with LOCK:
        return TOKENS.get(token)


def player_row(pid):
    with db() as c:
        r=c.execute('SELECT * FROM players WHERE player_id=?',(pid,)).fetchone()
        return dict(r) if r else None


def room_public(room):
    out={k:v for k,v in room.items() if k not in ('created_at','match_states')}
    members=[]
    for pid,m in room['members'].items():
        p=player_row(pid) or {'nickname':'PLAYER'}
        members.append({
            'player_id':pid,
            'nickname':p['nickname'],
            'hero_id':m.get('hero_id',0),
            'ready':bool(m.get('ready',False)),
            'host':pid==room['host_id'],
            'team':int(m.get('team',-1))
        })
    out['members']=members
    return out


def room_for(pid):
    with LOCK:
        for code,r in ROOMS.items():
            if pid in r['members']:
                return r
    return None


def cleanup_rooms():
    now=time.time()
    with LOCK:
        dead=[]
        for code,r in ROOMS.items():
            if not r['members'] or now-r['created_at']>6*3600:
                dead.append(code)
        for code in dead: ROOMS.pop(code,None)


class Handler(BaseHTTPRequestHandler):
    server_version='RushstarsServer/0.1'
    def log_message(self, fmt, *args):
        print('[HTTP]', self.address_string(), fmt%args)

    def _json(self,status,obj):
        raw=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers(); self.wfile.write(raw)

    def _body(self):
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<=0:return {}
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.end_headers()

    def do_GET(self):
        cleanup_rooms()
        u=urlparse(self.path); q=parse_qs(u.query)
        if u.path=='/':
            return self._json(200,{'ok':True,'server':'rushstars','message':'Rushstars shared server is online','time':int(time.time())})
        if u.path=='/health':
            return self._json(200,{'ok':True,'server':'rushstars','time':int(time.time())})
        if u.path=='/v1/rooms/state':
            pid=auth((q.get('token') or [''])[0])
            if not pid:return self._json(401,{'ok':False,'error':'not logged in'})
            r=room_for(pid)
            if not r:return self._json(404,{'ok':False,'error':'not in room'})
            return self._json(200,{'ok':True,'room':room_public(r)})
        if u.path=='/v1/players/search':
            pid=auth((q.get('token') or [''])[0])
            if not pid:return self._json(401,{'ok':False,'error':'not logged in'})
            term=((q.get('q') or [''])[0]).strip()
            with db() as c:
                rows=c.execute('SELECT player_id,nickname,trophies FROM players WHERE player_id=? OR nickname LIKE ? ORDER BY trophies DESC LIMIT 20',(term,'%'+term+'%')).fetchall()
            return self._json(200,{'ok':True,'players':[dict(r) for r in rows if r['player_id']!=pid]})
        if u.path=='/v1/invites':
            pid=auth((q.get('token') or [''])[0])
            if not pid:return self._json(401,{'ok':False,'error':'not logged in'})
            now=time.time()
            with LOCK:
                items=[]
                for inv in list(INVITES.get(pid,[])):
                    if now-float(inv.get('created_at',0))<=120:
                        src=player_row(inv.get('from_id','')) or {'nickname':'PLAYER'}
                        item=dict(inv); item['from_nickname']=src.get('nickname','PLAYER'); items.append(item)
                INVITES[pid]=items
            return self._json(200,{'ok':True,'invites':items})

        if u.path=='/v1/friends':
            pid=auth((q.get('token') or [''])[0])
            if not pid:return self._json(401,{'ok':False,'error':'not logged in'})
            with db() as c:
                rows=c.execute('''SELECT p.player_id,p.nickname,p.trophies FROM friends f JOIN players p ON p.player_id=f.b WHERE f.a=? ORDER BY p.nickname''',(pid,)).fetchall()
            return self._json(200,{'ok':True,'friends':[dict(r) for r in rows]})
        if u.path=='/v1/ranking':
            with db() as c:
                rows=c.execute('SELECT player_id,nickname,trophies FROM players ORDER BY trophies DESC LIMIT 100').fetchall()
            return self._json(200,{'ok':True,'ranking':[dict(r) for r in rows]})
        return self._json(404,{'ok':False,'error':'not found'})

    def do_POST(self):
        cleanup_rooms(); u=urlparse(self.path); b=self._body()
        if u.path=='/v1/login':
            device=str(b.get('device_id','')).strip(); nick=str(b.get('nickname','PLAYER')).strip()[:24] or 'PLAYER'; trophies=max(0,int(b.get('trophies',0)))
            if not device:return self._json(400,{'ok':False,'error':'device_id required'})
            now=int(time.time())
            with db() as c:
                row=c.execute('SELECT * FROM players WHERE device_id=?',(device,)).fetchone()
                if row:
                    pid=row['player_id']; c.execute('UPDATE players SET nickname=?, updated_at=? WHERE player_id=?',(nick,now,pid))
                else:
                    pid=make_id('RS',6)
                    while c.execute('SELECT 1 FROM players WHERE player_id=?',(pid,)).fetchone(): pid=make_id('RS',6)
                    c.execute('INSERT INTO players(player_id,device_id,nickname,trophies,created_at,updated_at) VALUES(?,?,?,?,?,?)',(pid,device,nick,trophies,now,now))
            token=make_id('T',24)
            with LOCK:TOKENS[token]=pid
            return self._json(200,{'ok':True,'player_id':pid,'token':token,'nickname':nick})

        token=str(b.get('token','')); pid=auth(token)
        if not pid:return self._json(401,{'ok':False,'error':'not logged in'})

        if u.path=='/v1/friends/add':
            target=str(b.get('target_id','')).strip()
            if target==pid:return self._json(400,{'ok':False,'error':'cannot add yourself'})
            if not player_row(target):return self._json(404,{'ok':False,'error':'player not found'})
            now=int(time.time())
            with db() as c:
                c.execute('INSERT OR IGNORE INTO friends(a,b,created_at) VALUES(?,?,?)',(pid,target,now))
                c.execute('INSERT OR IGNORE INTO friends(a,b,created_at) VALUES(?,?,?)',(target,pid,now))
            return self._json(200,{'ok':True})

        if u.path=='/v1/friends/remove':
            target=str(b.get('target_id','')).strip()
            with db() as c:
                c.execute('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)',(pid,target,target,pid))
            return self._json(200,{'ok':True})

        if u.path=='/v1/invites/send':
            target=str(b.get('target_id',''))
            if not target or target==pid:return self._json(400,{'ok':False,'error':'invalid target'})
            with db() as c:
                friend=c.execute('SELECT 1 FROM friends WHERE a=? AND b=?',(pid,target)).fetchone()
            if not friend:return self._json(403,{'ok':False,'error':'not friends'})
            r=room_for(pid)
            if not r:
                code=''.join(random.choice(string.ascii_uppercase+string.digits) for _ in range(6))
                with LOCK:
                    while code in ROOMS: code=''.join(random.choice(string.ascii_uppercase+string.digits) for _ in range(6))
                    r={'code':code,'host_id':pid,'mode':str(b.get('mode','SOLO')),'map':str(b.get('map','')),'members':{pid:{'hero_id':int(b.get('hero_id',0)),'ready':True,'team':-1}},'started':False,'created_at':time.time(),'match_states':{}}
                    ROOMS[code]=r
            else:
                with LOCK:
                    r['mode']=str(b.get('mode',r.get('mode','SOLO')))
                    r['map']=str(b.get('map',r.get('map','')))
                    if pid in r['members']:
                        r['members'][pid]['hero_id']=int(b.get('hero_id',r['members'][pid].get('hero_id',0)))
                        r['members'][pid]['ready']=True
            inv={'from_id':pid,'room_code':r['code'],'created_at':time.time()}
            with LOCK:
                INVITES.setdefault(target,[])
                INVITES[target]=[x for x in INVITES[target] if x.get('from_id')!=pid]
                INVITES[target].append(inv)
            return self._json(200,{'ok':True,'room':room_public(r)})

        if u.path=='/v1/invites/accept':
            from_id=str(b.get('from_id',''))
            with LOCK:
                invs=INVITES.get(pid,[])
                inv=next((x for x in invs if x.get('from_id')==from_id),None)
            if not inv:return self._json(404,{'ok':False,'error':'invite expired'})
            code=str(inv.get('room_code',''))
            with LOCK:r=ROOMS.get(code)
            if not r:return self._json(404,{'ok':False,'error':'party unavailable'})
            if r.get('started',False):return self._json(409,{'ok':False,'error':'match already started'})
            old=room_for(pid)
            if old and old is not r:
                with LOCK:old['members'].pop(pid,None)
            with LOCK:
                r['members'][pid]={'hero_id':int(b.get('hero_id',0)),'ready':True,'team':-1}
                INVITES[pid]=[x for x in INVITES.get(pid,[]) if x.get('from_id')!=from_id]
            return self._json(200,{'ok':True,'room':room_public(r)})

        if u.path=='/v1/invites/decline':
            from_id=str(b.get('from_id',''))
            with LOCK:INVITES[pid]=[x for x in INVITES.get(pid,[]) if x.get('from_id')!=from_id]
            return self._json(200,{'ok':True})

        if u.path=='/v1/rooms/create':
            old=room_for(pid)
            if old:
                with LOCK: old['members'].pop(pid,None)
            code=''.join(random.choice(string.ascii_uppercase+string.digits) for _ in range(6))
            with LOCK:
                while code in ROOMS: code=''.join(random.choice(string.ascii_uppercase+string.digits) for _ in range(6))
                r={'code':code,'host_id':pid,'mode':str(b.get('mode','SOLO')),'map':str(b.get('map','')),'started':False,'created_at':time.time(),'match_id':'','match_started_at':0.0,'match_states':{},'members':{pid:{'hero_id':int(b.get('hero_id',0)),'ready':False,'team':-1}}}
                ROOMS[code]=r
            return self._json(200,{'ok':True,'room':room_public(r)})

        if u.path=='/v1/rooms/join':
            code=str(b.get('code','')).strip().upper()
            with LOCK:r=ROOMS.get(code)
            if not r:return self._json(404,{'ok':False,'error':'room not found'})
            if r['started']:return self._json(409,{'ok':False,'error':'room already started'})
            limit=10 if r['mode'] in ('SOLO','DUO') else 6
            if pid not in r['members'] and len(r['members'])>=limit:return self._json(409,{'ok':False,'error':'room full'})
            old=room_for(pid)
            if old and old is not r:
                with LOCK:old['members'].pop(pid,None)
            with LOCK:r['members'][pid]={'hero_id':int(b.get('hero_id',0)),'ready':False,'team':-1}
            return self._json(200,{'ok':True,'room':room_public(r)})

        if u.path=='/v1/rooms/ready':
            r=room_for(pid)
            if not r:return self._json(404,{'ok':False,'error':'not in room'})
            with LOCK:r['members'][pid]['ready']=not bool(r['members'][pid].get('ready',False))
            return self._json(200,{'ok':True,'room':room_public(r)})

        if u.path=='/v1/rooms/start':
            r=room_for(pid)
            if not r:return self._json(404,{'ok':False,'error':'not in room'})
            mode=r.get('mode','SOLO')
            minimum=2
            if len(r['members'])<minimum:return self._json(409,{'ok':False,'error':'invite at least one friend first'})
            with LOCK:
                ids=list(r['members'].keys())
                for i,member_id in enumerate(ids):
                    if mode=='SOLO': team=-1
                    elif mode=='DUO': team=i//2
                    else: team=0 if i<3 else 1
                    r['members'][member_id]['team']=team
                r['started']=True
                r['match_id']=make_id('M',10)
                r['match_started_at']=time.time()
                r['match_states']={}
            return self._json(200,{'ok':True,'room':room_public(r)})

        if u.path=='/v1/match/sync':
            r=room_for(pid)
            if not r:return self._json(404,{'ok':False,'error':'not in room'})
            if not r.get('started',False):return self._json(409,{'ok':False,'error':'match not started'})
            state=b.get('state',{}) if isinstance(b.get('state',{}),dict) else {}
            member=r['members'].get(pid,{})
            clean={
                'player_id':pid,
                'nickname':(player_row(pid) or {'nickname':'PLAYER'})['nickname'],
                'hero_id':int(member.get('hero_id',0)),
                'team':int(member.get('team',-1)),
                'x':float(state.get('x',0.0)),
                'z':float(state.get('z',0.0)),
                'hp':max(0.0,float(state.get('hp',0.0))),
                'max_hp':max(1.0,float(state.get('max_hp',1.0))),
                'alive':bool(state.get('alive',True)),
                'super':max(0.0,min(100.0,float(state.get('super',0.0)))),
                'cubes':max(0,int(state.get('cubes',0))),
                'aim_x':float(state.get('aim_x',0.0)),
                'aim_z':float(state.get('aim_z',-1.0)),
                'attack_seq':max(0,int(state.get('attack_seq',0))),
                'super_seq':max(0,int(state.get('super_seq',0))),
                'updated_at':time.time()
            }
            with LOCK:r['match_states'][pid]=clean
            states=[]
            now=time.time()
            with LOCK:
                for member_id,m in r['members'].items():
                    st=r['match_states'].get(member_id)
                    if st is None:
                        pr=player_row(member_id) or {'nickname':'PLAYER'}
                        st={'player_id':member_id,'nickname':pr['nickname'],'hero_id':int(m.get('hero_id',0)),'team':int(m.get('team',-1)),'x':0.0,'z':0.0,'hp':0.0,'max_hp':1.0,'alive':True,'super':0.0,'cubes':0,'aim_x':0.0,'aim_z':-1.0,'attack_seq':0,'super_seq':0,'updated_at':0.0}
                    st=dict(st)
                    st['stale']=bool(st.get('updated_at',0.0)>0 and now-float(st.get('updated_at',0.0))>3.0)
                    states.append(st)
            return self._json(200,{'ok':True,'match_id':r.get('match_id',''),'server_time':now,'players':states})

        if u.path=='/v1/rooms/leave':
            r=room_for(pid)
            if not r:return self._json(200,{'ok':True})
            with LOCK:
                r['members'].pop(pid,None)
                if not r['members']:
                    ROOMS.pop(r['code'],None)
                elif r['host_id']==pid:
                    r['host_id']=next(iter(r['members']))
            return self._json(200,{'ok':True})

        return self._json(404,{'ok':False,'error':'not found'})


if __name__=='__main__':
    init_db()
    print(f'Rushstars shared server listening on http://{HOST}:{PORT}')
    print('Health check: /health')
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
