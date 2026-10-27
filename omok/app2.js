function stopTurnTimer(){
  if(turnTimer){clearInterval(turnTimer);turnTimer=null}
}
function updateTimerUI(){
  const box=$('turnTimerBox');
  const num=$('turnTimerNumber');
  const label=$('turnTimerLabel');

  if(num)num.textContent=String(Math.max(0,turnSeconds));
  if(label){
    if(!currentOpponent||queued||gameOver)label.textContent='남은 시간';
    else label.textContent=turn===1?'내 차례':'상대 차례';
  }

  if(box){
    box.classList.toggle('warning',turnSeconds<=5);
    box.classList.toggle('critical',turnSeconds<=3);
  }
}
function startTurnTimer(){
  stopTurnTimer();
  if(gameOver||!currentOpponent||queued)return;
  turnSeconds=20;
  updateTimerUI();
  turnTimer=setInterval(()=>{
    if(gameOver||queued||!currentOpponent){stopTurnTimer();return}
    turnSeconds--;
    updateTimerUI();
    if(turnSeconds<=0){
      stopTurnTimer();
      handleTimeout();
    }
  },1000);
}
function handleTimeout(){
  if(gameOver)return;
  gameOver=true;
  thinking=false;

  if(privateMode){
    const won=turn!==1;
    addPrivateRecord(privateOpponentName,won);
    $('status').textContent=won?'상대 시간 초과 · 승리':'시간 초과 패배';
    $('queueChip').textContent='사설방 종료';
    $('turnChip').textContent='시간 초과';
    turnSeconds=0;updateTimerUI();
    return;
  }

  if(turn===1){
    profile.losses++;
    profile.seasonLosses=(profile.seasonLosses||0)+1;
    profile.rating=Math.max(0,profile.rating-25);
    saveProfile();
    renderProfile();
    $('status').textContent='시간 초과 패배 · -25 RP';
    $('queueChip').textContent='대국 종료';
    $('turnChip').textContent='시간 초과';
  }else{
    profile.wins++;
    profile.seasonWins=(profile.seasonWins||0)+1;
    profile.rating+=25;
    saveProfile();
    renderProfile();
    $('status').textContent='상대 시간 초과 · 승리! +25 RP';
    $('queueChip').textContent='대국 종료';
    $('turnChip').textContent='상대 시간 초과';
  }
  turnSeconds=0;
  updateTimerUI();
}


function renderSeasonHistory(){
  if(!profile)return;
  ensureSeasonState();
  const games=(profile.seasonWins||0)+(profile.seasonLosses||0);
  const wr=games?Math.round((profile.seasonWins||0)/games*100):0;
  $('currentSeasonSummary').textContent=`현재 시즌 ${profile.season} · ${profile.seasonWins||0}승 ${profile.seasonLosses||0}패 · 승률 ${wr}% · ${profile.rating} RP`;
  const list=profile.seasonHistory||[];
  $('seasonHistoryList').innerHTML=list.length?list.map(s=>`<div class="rank-row" style="grid-template-columns:70px 1fr auto"><div class="rank-num">시즌 ${s.season}</div><div><b>${s.wins}승 ${s.losses}패 · 승률 ${s.winrate}%</b><div class="rank-note">최종 ${s.finalRating} RP${s.rank?` · 시즌 ${s.rank}위`:''}</div></div><div class="rank-rp">${s.rank?`${s.rank}위`:'랭킹 미진입'}</div></div>`).join(''):'<div class="rank-note">아직 종료된 시즌 기록이 없습니다.</div>';
}
$('seasonHistoryBtn').addEventListener('click',()=>{renderSeasonHistory();$('seasonHistoryModal').classList.remove('hidden')});
$('closeSeasonHistory').addEventListener('click',()=>$('seasonHistoryModal').classList.add('hidden'));

function loadFriends(){
  try{friends=JSON.parse(localStorage.getItem('omok_friends_v1'))||[]}catch(e){friends=[]}
  try{friendRecords=JSON.parse(localStorage.getItem('omok_friend_records_v1'))||{}}catch(e){friendRecords={}}
}
function saveFriends(){
  try{localStorage.setItem('omok_friends_v1',JSON.stringify(friends))}catch(e){}
  try{localStorage.setItem('omok_friend_records_v1',JSON.stringify(friendRecords))}catch(e){}
}
function getFriendRecord(name){
  const r=friendRecords[name]||{wins:0,losses:0};
  const games=r.wins+r.losses;
  return {wins:r.wins,losses:r.losses,winrate:games?Math.round(r.wins/games*100):0};
}
function addPrivateRecord(name,won){
  if(!name)return;
  if(!friendRecords[name])friendRecords[name]={wins:0,losses:0};
  if(won)friendRecords[name].wins++;
  else friendRecords[name].losses++;
  saveFriends();
}
function renderFriends(){
  const list=$('friendList');
  if(!friends.length){
    list.innerHTML='<div class="rank-note">아직 추가한 친구가 없습니다.</div>';
    return;
  }
  list.innerHTML=friends.map((name,i)=>{
    const r=getFriendRecord(name);
    return `
      <div class="friend-row">
        <div class="avatar" style="width:38px;height:38px">${name.slice(0,1)}</div>
        <div>
          <b>${name}</b>
          <div class="friend-record">상대전적 ${r.wins}승 ${r.losses}패 · 승률 ${r.winrate}%</div>
        </div>
        <div class="friend-actions">
          <button class="small-btn record-friend" data-i="${i}" type="button">전적</button>
          <button class="small-btn invite-friend" data-i="${i}" type="button">초대</button>
          <button class="small-btn remove-friend" data-i="${i}" type="button">삭제</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.remove-friend').forEach(b=>b.addEventListener('click',()=>{
    const name=friends[Number(b.dataset.i)];
    friends.splice(Number(b.dataset.i),1);
    saveFriends();
    renderFriends();
    $('friendMsg').textContent=`${name} 님을 친구 목록에서 삭제했습니다.`;
  }));
  list.querySelectorAll('.record-friend').forEach(b=>b.addEventListener('click',()=>{
    const name=friends[Number(b.dataset.i)];
    const r=getFriendRecord(name);
    $('friendMsg').textContent=`${name} 상대전적: ${r.wins}승 ${r.losses}패 · 승률 ${r.winrate}%`;
  }));
  list.querySelectorAll('.invite-friend').forEach(b=>b.addEventListener('click',()=>{
    const name=friends[Number(b.dataset.i)];
    $('friendsModal').classList.add('hidden');
    $('privateRoomModal').classList.remove('hidden');
    if(!currentRoomCode) createPrivateRoom();
    $('roomStatus').textContent=`${name} 님에게 초대할 방 코드: ${currentRoomCode}`;
  }));
}
function randomRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='';for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function closeRoomChannel(){
  if(roomChannel){try{roomChannel.close()}catch(e){}roomChannel=null}
}
function attachRoomChannel(code){
  closeRoomChannel();
  if(!('BroadcastChannel' in window)){
    $('roomStatus').textContent='이 브라우저는 사설방 테스트 기능을 지원하지 않습니다.';
    return;
  }
  roomChannel=new BroadcastChannel('omok_private_'+code);
  roomChannel.onmessage=(ev)=>{
    const m=ev.data||{};
    if(m.sender===profile.nickname)return;

    if(m.type==='hello'){
      privateOpponentName=m.sender;
      privateReady=true;
      $('roomStatus').textContent=`${privateOpponentName} 님이 입장했습니다.`;
      roomChannel.postMessage({type:'hello_ack',sender:profile.nickname});
      if(privateHost){
        startPrivateGame();
      }
    }else if(m.type==='hello_ack'){
      privateOpponentName=m.sender;
      privateReady=true;
      $('roomStatus').textContent=`${privateOpponentName} 님과 연결되었습니다.`;
      if(!privateHost) startPrivateGame();
    }else if(m.type==='start'){
      privateOpponentName=m.sender;
      privateReady=true;
      privateMode=true;
      currentOpponent={name:m.sender,rating:'사설',tier:'친구'};
      resetBoard();
      turn=m.yourTurn?1:2;
      $('oppName').textContent=m.sender;
      $('oppMeta').textContent='사설방 친구 대전 · RP/시즌전적 미반영';
      $('oppAvatar').textContent=m.sender.slice(0,1);
      $('queueChip').textContent='사설방 대전';
      $('status').textContent=turn===1?'내 차례입니다.':'상대 차례입니다.';
      $('turnChip').textContent=turn===1?'현재: 흑':'현재: 백';
      startTurnTimer();
      $('privateRoomModal').classList.add('hidden');
    }else if(m.type==='move' && privateMode){
      if(board[m.r][m.c]===0){
        stopTurnTimer();
        place(m.r,m.c,2);
        if(!gameOver){
          turn=1;
          $('status').textContent='내 차례입니다.';
          $('turnChip').textContent='현재: 흑';
          startTurnTimer();
        }
      }
    }else if(m.type==='leave'){
      privateReady=false;
      privateOpponentName='';
      $('roomStatus').textContent='상대가 방을 나갔습니다.';
      if(privateMode){
        privateMode=false;
        gameOver=true;
        stopTurnTimer();
        $('status').textContent='상대가 사설방에서 나갔습니다.';
      }
    }
  };
}
function createPrivateRoom(){
  if(!profile)return;
  currentRoomCode=randomRoomCode();
  privateHost=true;privateMode=false;privateReady=false;privateOpponentName='';
  attachRoomChannel(currentRoomCode);
  $('privateLobbyView').classList.add('hidden');
  $('roomView').classList.remove('hidden');
  $('roomCodeText').textContent=currentRoomCode;
  $('roomStatus').textContent='상대를 기다리는 중...';
}
function joinPrivateRoom(){
  if(!profile)return;
  const code=$('joinCodeInput').value.trim().toUpperCase();
  if(code.length!==6){alert('6자리 방 코드를 입력해 주세요.');return}
  currentRoomCode=code;privateHost=false;privateMode=false;privateReady=false;privateOpponentName='';
  attachRoomChannel(code);
  $('privateLobbyView').classList.add('hidden');
  $('roomView').classList.remove('hidden');
  $('roomCodeText').textContent=code;
  $('roomStatus').textContent='방에 접속하는 중...';
  setTimeout(()=>{if(roomChannel)roomChannel.postMessage({type:'hello',sender:profile.nickname})},100);
}
function startPrivateGame(){
  if(!roomChannel||!privateReady)return;
  privateMode=true;
  currentOpponent={name:privateOpponentName,rating:'사설',tier:'친구'};
  resetBoard();
  turn=1;
  $('oppName').textContent=privateOpponentName;
  $('oppMeta').textContent='사설방 친구 대전 · RP/시즌전적 미반영';
  $('oppAvatar').textContent=privateOpponentName.slice(0,1);
  $('queueChip').textContent='사설방 대전';
  $('status').textContent='내 차례입니다.';
  $('turnChip').textContent='현재: 흑';
  startTurnTimer();
  $('privateRoomModal').classList.add('hidden');
  roomChannel.postMessage({type:'start',sender:profile.nickname,yourTurn:false});
}
function leavePrivateRoom(){
  if(roomChannel&&profile)roomChannel.postMessage({type:'leave',sender:profile.nickname});
  closeRoomChannel();
  privateMode=false;privateReady=false;privateHost=false;currentRoomCode=null;privateOpponentName='';
  $('roomView').classList.add('hidden');
  $('privateLobbyView').classList.remove('hidden');
  $('roomCodeText').textContent='------';
  $('roomStatus').textContent='상대를 기다리는 중...';
}
$('privateRoomBtn').addEventListener('click',()=>{
  $('privateRoomModal').classList.remove('hidden');
  $('privateLobbyView').classList.toggle('hidden',!!currentRoomCode);
  $('roomView').classList.toggle('hidden',!currentRoomCode);
});
$('closePrivateRoom').addEventListener('click',()=>$('privateRoomModal').classList.add('hidden'));
$('createRoomBtn').addEventListener('click',createPrivateRoom);
$('joinRoomBtn').addEventListener('click',joinPrivateRoom);
$('leaveRoomBtn').addEventListener('click',leavePrivateRoom);

$('friendsBtn').addEventListener('click',()=>{
  renderFriends();
  $('friendsModal').classList.remove('hidden');
});
$('closeFriends').addEventListener('click',()=>$('friendsModal').classList.add('hidden'));
$('addFriendBtn').addEventListener('click',()=>{
  const n=sanitizeNick($('friendNickInput').value);
  if(n.length<2){$('friendMsg').textContent='닉네임은 2자 이상 입력해 주세요.';return}
  if(profile&&n===profile.nickname){$('friendMsg').textContent='자기 자신은 추가할 수 없습니다.';return}
  if(friends.includes(n)){$('friendMsg').textContent='이미 친구 목록에 있습니다.';return}
  friends.push(n);if(!friendRecords[n])friendRecords[n]={wins:0,losses:0};saveFriends();$('friendNickInput').value='';$('friendMsg').textContent=`${n} 님을 친구 목록에 추가했습니다.`;renderFriends()
});
