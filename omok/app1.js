/* tier images loaded from tiers.js */
const TIERS = [
  {name:'브론즈',min:0,max:500},
  {name:'실버',min:501,max:1000},
  {name:'골드',min:1001,max:1500},
  {name:'플래티넘',min:1501,max:2000},
  {name:'다이아',min:2001,max:3000},
  {name:'마스터',min:3001,max:4000},
  {name:'그랜드마스터',min:4001,max:5000},
  {name:'챔피언',min:5001,max:Infinity}
];
const N=15,$=id=>document.getElementById(id);
let profile=null,board=[],history=[],turn=1,gameOver=false,thinking=false,queued=false,currentOpponent=null,rankRows=[];
let turnTimer=null,turnSeconds=20;
let friends=[];
let friendRecords={};
let roomChannel=null,currentRoomCode=null,privateMode=false,privateHost=false,privateReady=false,privateOpponentName='';
const SEASON_MS=7*24*60*60*1000;
function normalizeSeasonState(){
  if(!profile)return;
  if(!Array.isArray(profile.seasonHistory))profile.seasonHistory=[];
  if(!Number.isFinite(Number(profile.season))||Number(profile.season)<1)profile.season=1;
  profile.season=Number(profile.season);
  if(!Number.isFinite(profile.seasonStartAt))profile.seasonStartAt=Date.now();
  if(!Number.isFinite(profile.seasonWins))profile.seasonWins=0;
  if(!Number.isFinite(profile.seasonLosses))profile.seasonLosses=0;
}
function archiveCurrentSeason(){
  normalizeSeasonState();
  const games=profile.seasonWins+profile.seasonLosses;
  const winrate=games?Math.round(profile.seasonWins/games*100):0;
  let rank=null;
  if(profile.rating>=3001){
    const rnd=seededRandom('archive-'+profile.season+'-'+profile.rating);
    const approx=501-Math.floor((Math.min(profile.rating,5900)-3001)/5.8);
    rank=Math.max(1,Math.min(500,approx+Math.floor((rnd()-.5)*18)));
  }
  profile.seasonHistory.unshift({season:profile.season,wins:profile.seasonWins,losses:profile.seasonLosses,winrate,finalRating:profile.rating,rank,endedAt:profile.seasonStartAt+SEASON_MS});
  profile.seasonHistory=profile.seasonHistory.slice(0,50);
}
function ensureSeasonState(){
  if(!profile)return;
  normalizeSeasonState();
  const now=Date.now();
  while(now-profile.seasonStartAt>=SEASON_MS){
    archiveCurrentSeason();
    profile.season+=1;
    profile.seasonStartAt+=SEASON_MS;
    profile.seasonWins=0;
    profile.seasonLosses=0;
  }
  saveProfile();
}
function seasonTimeText(){
  if(!profile)return '';
  normalizeSeasonState();
  const left=Math.max(0,profile.seasonStartAt+SEASON_MS-Date.now());
  const d=Math.floor(left/86400000);
  const h=Math.floor((left%86400000)/3600000);
  return `시즌 ${profile.season} · 종료까지 ${d}일 ${h}시간`;
}

function tierFor(rp){rp=Math.max(0,rp);return TIERS.find(t=>rp>=t.min&&rp<=t.max)||TIERS[TIERS.length-1]}
function loadProfile(){try{const x=JSON.parse(localStorage.getItem('omok_account_v4'));if(x&&x.nickname)return x}catch(e){}return null}
function saveProfile(){localStorage.setItem('omok_account_v4',JSON.stringify(profile))}
function sanitizeNick(v){return v.replace(/[<>]/g,'').trim().slice(0,12)}

function initAccount(){
  profile=loadProfile();
  if(!profile){$('accountOverlay').classList.remove('hidden')}
  else{
    ensureSeasonState();
    renderProfile()
  }
}
$('accountForm').addEventListener('submit',e=>{
  e.preventDefault();const nick=sanitizeNick($('nicknameInput').value);
  if(nick.length<2){$('accountError').textContent='닉네임은 2자 이상 입력해 주세요.';return}
  profile={nickname:nick,rating:0,wins:0,losses:0,season:1,seasonWins:0,seasonLosses:0,seasonStartAt:Date.now(),seasonHistory:[],createdAt:Date.now()};
  saveProfile();ensureSeasonState();$('accountOverlay').classList.add('hidden');renderProfile();resetLobby()
});

$('accountMenuBtn').addEventListener('click',()=>{
  if(profile){
    const t=tierFor(profile.rating);
    $('accountMenuSummary').textContent=`${profile.nickname} · ${t.name} · ${profile.rating} RP`;
  }
  $('accountMenuModal').classList.remove('hidden');
});
$('closeAccountMenu').addEventListener('click',()=>$('accountMenuModal').classList.add('hidden'));

$('changeNick').addEventListener('click',()=>{
  if(!profile)return;
  const n=prompt('새 닉네임을 입력하세요.',profile.nickname);
  if(n===null)return;
  const nick=sanitizeNick(n);
  if(nick.length<2){alert('닉네임은 2자 이상이어야 합니다.');return}
  profile.nickname=nick;saveProfile();renderProfile();$('accountMenuModal').classList.add('hidden')
});
$('deleteAccount').addEventListener('click',()=>{
  if(!profile)return;
  const ok=confirm('현재 계정의 닉네임, 전적, 레이팅을 모두 삭제하고 새 계정을 만들까요?');
  if(!ok)return;
  try{localStorage.removeItem('omok_account_v4')}catch(e){}
  try{localStorage.removeItem('omok_friends_v1')}catch(e){}
  try{localStorage.removeItem('omok_friend_records_v1')}catch(e){}
  friends=[];friendRecords={};
  profile=null;
  stopTurnTimer();
  resetLobby();
  $('accountError').textContent='';
  $('nicknameInput').value='';
  $('accountMenuModal').classList.add('hidden');$('accountOverlay').classList.remove('hidden');
});


function renderProfile(){
  if(!profile)return;
  ensureSeasonState();
  const t=tierFor(profile.rating),total=profile.wins+profile.losses;
  $('myName').textContent=profile.nickname;$('myAvatar').textContent=profile.nickname.slice(0,1);$('profileNick').textContent=profile.nickname;$('profileSummary').textContent=`${profile.nickname} · ${t.name}`;
  $('myMeta').textContent=`${t.name} · ${profile.rating} RP`;
  $('tierName').textContent=t.name;$('rpText').textContent=`${profile.rating} RP`;
  $('tierImg').src=TIER_IMAGES[t.name];$('tierImg').alt=t.name;
  $('wins').textContent=profile.wins;$('losses').textContent=profile.losses;$('winrate').textContent=total?Math.round(profile.wins/total*100)+'%':'0%';
  $('seasonText').textContent=seasonTimeText();
  buildRanking()
}

function setupThresholds(){
  $('thresholds').innerHTML=TIERS.map(t=>`<div class="threshold"><img src="${TIER_IMAGES[t.name]}" alt="${t.name}"><div><b>${t.name}</b><div style="color:var(--muted)">${t.max===Infinity?t.min+' RP 이상 · 상한 없음':t.min+' ~ '+t.max+' RP'}</div></div></div>`).join('')
}
function seededRandom(seed){
  let h=2166136261;
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}
  return function(){h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}
}
function buildRanking(){
  if(!profile)return;
  const rnd=seededRandom(String(profile.season)+'-omok-season-ranking');
  const koA=['천원','묵향','청룡','백운','태극','한성','금강','매화','월하','풍림','흑돌','백돌','수읽기','돌부처','끝내기','장목','오목왕','장군','선비','기사'];
  const koB=['고수','장인','패왕','도사','명인','천재','낭인','대장','고인물','초보탈출','수호자','한수','돌잡이','수읽음','승부사'];
  const enA=['Shadow','Neo','Zero','Luna','Ghost','Alpha','Omega','Pixel','Nova','Blitz','Raven','Mochi','Kuma','Neko','Sigma','Doom','Lucky','Zen','King','Queen'];
  const enB=['Master','Stone','Five','Rush','Fox','Bear','Core','X','GG','OP','Prime','404','777','Noob','Pro','Main','Bot','Sensei'];
  const jpA=['黒石','白石','月影','雷神','風神','桜','狐','猫','侍','夜空','零','碁神','五連','龍'];
  const jpB=['ちゃん','くん','先生','丸','太郎','姫','王','神','DX','EX','99'];
  const cnA=['黑石','白棋','龙王','月影','无敌','小虎','棋圣','风神','雷霆','五连','天元','夜猫'];
  const cnB=['高手','王','神','哥','弟','大师','666','Pro','无双'];
  const meme=['억까방지위원회','이게맞나','일단둬','오목GOAT','돌하르방','한수만','두면이김','킹받네','정신차려AI','수읽기실패','GG치자','안막으면짐','오늘도한판','5목가자','돌돌돌','내가왜여기','브실골탈출','마스터가자','챔찍먹','버스기사'];
  const rows=[];

  function makeRandomNick(){
    const mode=Math.floor(rnd()*7);
    let name='';
    if(mode===0) name=koA[Math.floor(rnd()*koA.length)]+koB[Math.floor(rnd()*koB.length)];
    else if(mode===1) name=enA[Math.floor(rnd()*enA.length)]+enB[Math.floor(rnd()*enB.length)];
    else if(mode===2) name=jpA[Math.floor(rnd()*jpA.length)]+jpB[Math.floor(rnd()*jpB.length)];
    else if(mode===3) name=cnA[Math.floor(rnd()*cnA.length)]+cnB[Math.floor(rnd()*cnB.length)];
    else if(mode===4) name=meme[Math.floor(rnd()*meme.length)];
    else if(mode===5) name=enA[Math.floor(rnd()*enA.length)]+'_'+Math.floor(10+rnd()*990);
    else name=koA[Math.floor(rnd()*koA.length)]+Math.floor(1+rnd()*999);
    return name;
  }

  for(let i=0;i<560;i++){
    let p=rnd();
    let rp;
    if(p<0.68){
      rp=Math.floor(3001+rnd()*999);
    }else if(p<0.94){
      rp=Math.floor(4001+rnd()*999);
    }else{
      rp=Math.floor(5001+rnd()*900);
    }
    const name=makeRandomNick();
    rows.push({name,rp,isMe:false});
  }

  if(profile.rating>=3001)rows.push({name:profile.nickname,rp:profile.rating,isMe:true});
  rows.sort((a,b)=>b.rp-a.rp);
  rankRows=rows.slice(0,500);

  const idx=rankRows.findIndex(x=>x.isMe);
  $('myRankInfo').textContent=
    profile.rating<3001
      ? `현재 ${profile.rating} RP · 마스터 3001 RP부터 시즌 랭킹에 진입합니다.`
      : idx>=0
        ? `현재 시즌 순위: ${idx+1}위 · 랭커`
        : '현재 500위 밖입니다. 500위 안에 들면 랭커로 표시됩니다.';
  renderRanking();
}
function renderRanking(){
  $('rankingList').innerHTML=rankRows.map((x,i)=>{
    const t=tierFor(x.rp);
    return `<div class="rank-row ${x.isMe?'me':''}"><div class="rank-num">${i+1}</div><img class="rank-icon" src="${TIER_IMAGES[t.name]}" alt="${t.name}"><div><b>${x.name}</b><div style="color:var(--muted);font-size:11px">${t.name}</div></div><div class="rank-rp">${x.rp} RP</div></div>`
  }).join('')
}
$('rankToggle').addEventListener('click',()=>{const el=$('rankPanel');el.classList.toggle('hidden');$('rankToggle').textContent=el.classList.contains('hidden')?'랭킹 보기':'랭킹 닫기'});
$('profileToggle').addEventListener('click',()=>{const el=$('profilePanel');el.classList.toggle('hidden');$('profileToggle').textContent=el.classList.contains('hidden')?'프로필 보기':'프로필 닫기'});
