function setupBoard(){
  const boardEl=$('board');boardEl.innerHTML='';
  for(let i=0;i<=15;i++){const d=document.createElement('div');d.className='coord';d.textContent=i?i:'';boardEl.appendChild(d)}
  for(let r=0;r<N;r++){
    const l=document.createElement('div');l.className='coord';l.textContent=r+1;boardEl.appendChild(l);
    for(let c=0;c<N;c++){
      const b=document.createElement('button');b.type='button';b.className='cell';b.dataset.r=r;b.dataset.c=c;b.setAttribute('aria-label',`${r+1}행 ${c+1}열`);
      if([3,7,11].includes(r)&&[3,7,11].includes(c)){const s=document.createElement('span');s.className='star';b.appendChild(s)}
      b.addEventListener('pointerdown',e=>{e.preventDefault()});
      b.addEventListener('click',e=>{
        e.preventDefault();
        const sx=window.scrollX, sy=window.scrollY;
        if(document.activeElement===b)b.blur();
        playerMove(r,c);
        requestAnimationFrame(()=>window.scrollTo(sx,sy));
      });
      boardEl.appendChild(b)
    }
  }
}
function cellAt(r,c){return $('board').children[(r+1)*16+(c+1)]}
function clearStones(){$('board').querySelectorAll('.stone').forEach(x=>x.remove());$('board').querySelectorAll('.cell').forEach(x=>x.classList.remove('last'))}
function renderBoard(){
  const pageX=window.scrollX, pageY=window.scrollY;
  const wrap=document.querySelector('.board-wrap');
  const bx=wrap?wrap.scrollLeft:0, by=wrap?wrap.scrollTop:0;
  clearStones();
  for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(board[r][c]){const s=document.createElement('span');s.className='stone '+(board[r][c]===1?'black':'white');cellAt(r,c).appendChild(s)}
  if(history.length){const m=history[history.length-1];cellAt(m.r,m.c).classList.add('last')}
  if(wrap){wrap.scrollLeft=bx;wrap.scrollTop=by}
  requestAnimationFrame(()=>window.scrollTo(pageX,pageY));
}
function resetBoard(){stopTurnTimer();board=Array.from({length:N},()=>Array(N).fill(0));history=[];turn=1;gameOver=false;thinking=false;turnSeconds=20;updateTimerUI();renderBoard()}
function resetLobby(){
  resetBoard();currentOpponent=null;queued=false;$('oppName').textContent='상대 대기 중';$('oppMeta').textContent='같은 티어대 상대를 찾습니다.';$('oppAvatar').textContent='?';
  $('status').textContent='매칭을 시작해 주세요.';$('queueChip').textContent='대기 중';$('turnChip').textContent='선공 미정';turnSeconds=20;updateTimerUI();$('matchBtn').disabled=false
}
function makeOpponent(){
  const t=tierFor(profile.rating);
  let min=t.min,max=t.max===Infinity?profile.rating+500:t.max;
  if(t.name==='챔피언')min=Math.max(5001,profile.rating-500);
  const rp=Math.floor(min+Math.random()*(max-min+1));

  const pools=[
    ['한성고수','묵향기사','청룡수','월하도인','태극선비','금강기사','매화명인','백운도사','흑돌장인','오목GOAT','브실골탈출','안막으면짐','한수만','오늘도한판','돌부처'],
    ['ShadowFive','NeoStone','LunaGG','Ghost404','AlphaRush','OmegaFive','PixelMaster','NovaOP','RavenStone','SigmaMain','Lucky777','KumaSensei','NekoPro','ZenFive'],
    ['黒石ちゃん','白石先生','月影くん','雷神丸','風神DX','桜姫','狐太郎','猫先生','五連王','龍神','零EX'],
    ['黑石高手','白棋大师','龙王666','月影哥','无敌棋圣','小虎Pro','风神王','雷霆大师','五连神','天元无双'],
    ['이게맞나','킹받네','정신차려AI','수읽기실패','GG치자','두면이김','돌돌돌','내가왜여기','마스터가자','챔찍먹','버스기사','억까방지위원회']
  ];
  const pool=pools[Math.floor(Math.random()*pools.length)];
  let name=pool[Math.floor(Math.random()*pool.length)];
  if(Math.random()<0.38) name += String(Math.floor(1+Math.random()*999));
  return {name,rating:rp,tier:tierFor(rp).name};
}
$('matchBtn').addEventListener('click',()=>{
  if(queued||thinking||!profile)return;
  resetBoard();queued=true;$('matchBtn').disabled=true;$('queueChip').textContent='매칭 중…';$('status').textContent='현재 티어대 상대를 찾는 중입니다…';$('turnChip').textContent='상대 검색 중';
  setTimeout(()=>{
    currentOpponent=makeOpponent();queued=false;$('matchBtn').disabled=false;$('oppName').textContent=currentOpponent.name;$('oppMeta').textContent=`${currentOpponent.tier} · ${currentOpponent.rating} RP`;$('oppAvatar').textContent=currentOpponent.name.slice(0,1);$('queueChip').textContent='매칭 완료';$('status').textContent=`${currentOpponent.name} 님과 매칭되었습니다. 흑 선공입니다.`;$('turnChip').textContent='현재: 흑';startTurnTimer()
  },900+Math.random()*900)
});

function checkWin(r,c,p){
  for(const[dr,dc]of[[1,0],[0,1],[1,1],[1,-1]]){let n=1;for(const s of[-1,1]){let rr=r+dr*s,cc=c+dc*s;while(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===p){n++;rr+=dr*s;cc+=dc*s}}if(n>=5)return true}return false
}
function place(r,c,p){board[r][c]=p;history.push({r,c,p});renderBoard();if(checkWin(r,c,p)){finish(p);return}turn=p===1?2:1;updateTimerUI()}
function playerMove(r,c){
  if(!currentOpponent||queued||thinking||gameOver||turn!==1||board[r][c])return;
  stopTurnTimer();place(r,c,1);
  if(privateMode){
    if(roomChannel)roomChannel.postMessage({type:'move',sender:profile.nickname,r,c});
    if(gameOver)return;
    turn=2;
    $('status').textContent='상대 차례입니다.';
    $('turnChip').textContent='현재: 백';
    startTurnTimer();
    return;
  }
  if(gameOver)return;thinking=true;$('status').textContent=`${currentOpponent.name} 님이 수를 읽는 중…`;$('turnChip').textContent='현재: 백';startTurnTimer();setTimeout(aiMove,220)
}
function score(r,c,p){
  board[r][c]=p;if(checkWin(r,c,p)){board[r][c]=0;return 100000}let total=0;
  for(const[dr,dc]of[[1,0],[0,1],[1,1],[1,-1]]){let count=1,open=0;for(const s of[-1,1]){let rr=r+dr*s,cc=c+dc*s;while(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===p){count++;rr+=dr*s;cc+=dc*s}if(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===0)open++}if(count>=4)total+=13000;else if(count===3&&open===2)total+=2600;else if(count===3)total+=820;else if(count===2&&open===2)total+=210;else total+=count*9}
  board[r][c]=0;return total
}
