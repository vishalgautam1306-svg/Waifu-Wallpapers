'use strict';
const $=id=>document.getElementById(id);
const API=String(window.WAIFU_COMMUNITY_API||'').trim().replace(/\/+$/,'');
const CHAT_NICK_KEY='waifu-wallpapers-chat-nickname';
const POLL_VOTES_KEY='waifu-wallpapers-voted-polls';
let chatEnabled=false,pollsEnabled=false,sending=false,fetchingChat=false,voting=false,pollData=[],lastMessages=[];
let voteSet=new Set();
try{voteSet=new Set(JSON.parse(localStorage.getItem(POLL_VOTES_KEY)||'[]'))}catch(_){}
try{$('chatNick').value=localStorage.getItem(CHAT_NICK_KEY)||'';}catch(_){}
function saveNick(){try{localStorage.setItem(CHAT_NICK_KEY,$('chatNick').value.trim())}catch(_){}}
function saveVotes(){try{localStorage.setItem(POLL_VOTES_KEY,JSON.stringify([...voteSet]))}catch(_){}}
async function request(path,opts={}){
 const response=await fetch(API+path,{cache:'no-store',...opts});
 let result={};try{result=await response.json()}catch(_){}
 if(!response.ok)throw new Error(result.error||'Unable to reach community services ('+response.status+')');
 return result;
}
function p(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function humanDate(timestamp){
 const date=new Date(Number(timestamp)||Date.now());
 return date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function setChat(enabled,label){
 chatEnabled=Boolean(enabled);
 $('chatState').textContent=label||(enabled?'● Room open':'Room closed');
 $('chatNick').disabled=!enabled;$('chatMessage').disabled=!enabled;$('sendChat').disabled=!enabled||sending;
 $('chatMessage').placeholder=enabled?'Say something about anime…':'Chat is currently closed for moderation setup';
}
function renderMessages(data){
 const list=$('chatMessages');const bottom=list.scrollHeight-list.scrollTop-list.clientHeight<100;
 list.replaceChildren();
 if(!data.length){
  list.append(p('div','placeholder',chatEnabled?'No messages yet. Start the conversation!':'The global chat will open after moderation testing.'));
 }else{
  for(const msg of data){
   const box=p('div','chat-msg');
   const meta=p('div','chat-meta');
   const who=p('strong',null,msg.nickname||'Guest');
   const when=p('time',null,humanDate(msg.createdAt));when.dateTime=new Date(msg.createdAt).toISOString();
   const report=p('button',null,'Report');report.type='button';report.title='Report this message to site moderation';
   report.addEventListener('click',()=>reportMessage(msg.id,report));
   meta.append(who,when,report);
   const body=p('p',null,msg.body||'');
   box.append(meta,body);list.append(box);
  }
 }
 if(bottom)list.scrollTop=list.scrollHeight;
}
async function loadChat(){
 if(fetchingChat||!chatEnabled||!API||document.hidden)return;
 fetchingChat=true;
 try{
  const data=await request('/api/community/messages?limit=60');
  const newMessages=Array.isArray(data.items)?data.items:[];
  if(JSON.stringify(newMessages.map(x=>[x.id,x.body]))!==JSON.stringify(lastMessages.map(x=>[x.id,x.body]))){
   lastMessages=newMessages;renderMessages(lastMessages);
  }
 }catch(e){$('chatFeedback').textContent=e.message}
 finally{fetchingChat=false;}
}
async function sendChat(event){
 event.preventDefault();if(!chatEnabled||sending)return;
 const nickname=$('chatNick').value.trim().replace(/\s+/g,' ').slice(0,24);
 const body=$('chatMessage').value.trim().slice(0,240);
 if(nickname.length<2||body.length<2){$('chatFeedback').textContent='Enter a nickname and a message of at least two characters.';return;}
 sending=true;$('sendChat').disabled=true;$('chatFeedback').textContent='Sending…';
 try{
  saveNick();
  await request('/api/community/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,body})});
  $('chatMessage').value='';$('chatFeedback').textContent='Message sent. Be respectful and protect your privacy.';
  await loadChat();
 }catch(e){$('chatFeedback').textContent=e.message;}
 finally{sending=false;$('sendChat').disabled=!chatEnabled;}
}
async function reportMessage(id,button){
 if(!confirm('Report this message for moderator review?'))return;
 button.disabled=true;
 try{await request('/api/community/messages/'+encodeURIComponent(id)+'/report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});$('chatFeedback').textContent='Report received for admin review.'}
 catch(e){$('chatFeedback').textContent=e.message;button.disabled=false;}
}
function renderPolls(){
 const root=$('pollList');root.replaceChildren();
 if(!pollData.length){
  const empty=p('div','poll-empty');empty.append(p('div','poll-icon','◇'),p('strong',null,'No active polls yet'),p('p',null,'The owner will post character and theme polls here. You can browse wallpapers meanwhile.'));
  root.append(empty);return;
 }
 for(const poll of pollData){
  const voted=voteSet.has(poll.id),closed=poll.status!=='active'||!pollsEnabled;
  const total=Number(poll.totalVotes)||0;
  const card=p('article','poll-card');card.append(p('div','poll-kicker',closed?'POLL CLOSED':'COMMUNITY CHOICE'),p('h3',null,poll.question||'Untitled poll'));
  for(let i=0;i<(poll.options||[]).length;i++){
   const option=p('button','poll-option');option.type='button';option.disabled=voted||closed||voting;
   const num=Number(poll.counts?.[i]||0),percentage=total?Math.round(num/total*100):0;
   if(voted||closed){
    const bar=p('span','option-bar');bar.style.width=percentage+'%';option.append(bar);
   }
   option.append(p('span',null,poll.options[i]));
   if(voted||closed)option.append(p('span','pct',percentage+'%'));
   else option.addEventListener('click',()=>votePoll(poll.id,i));
   card.append(option);
  }
  const foot=p('div','poll-foot');foot.append(p('span',null,total+' votes'),p('span',null,voted?'Thank you for voting ♥':closed?'Voting closed':'Choose one option'));
  card.append(foot);root.append(card);
 }
}
async function loadPolls(){
 if(!API)return;
 try{const data=await request('/api/community/polls');pollData=Array.isArray(data.items)?data.items:[];renderPolls();}
 catch(e){$('pollFeedback').textContent=e.message;pollData=[];renderPolls();}
}
async function votePoll(id,index){
 if(voting||voteSet.has(id))return;
 if(!confirm('Vote for this wallpaper request? You can vote once per poll.'))return;
 voting=true;renderPolls();
 try{
  await request('/api/community/polls/'+encodeURIComponent(id)+'/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({option:index})});
  voteSet.add(id);saveVotes();$('pollFeedback').textContent='Vote counted! Thanks for helping choose upcoming wallpapers.';
  await loadPolls();
 }catch(e){$('pollFeedback').textContent=e.message;}
 finally{voting=false;renderPolls();}
}
async function init(){
 $('chatForm').addEventListener('submit',sendChat);
 $('chatNick').addEventListener('change',saveNick);
 $('refreshChat').addEventListener('click',()=>{loadChat();loadPolls();});
 setChat(false,'Checking chat…');
 if(!API){setChat(false,'Room unavailable');renderMessages([]);renderPolls();$('pollFeedback').textContent='Community services are not configured.';return;}
 try{
  const status=await request('/api/community/status');
  pollsEnabled=Boolean(status.pollsEnabled);
  setChat(Boolean(status.chatEnabled),status.chatEnabled?'● Room open':'● Chat beta · Locked');
  if(chatEnabled)await loadChat();else renderMessages([]);
  await loadPolls();
  if(!chatEnabled)$('chatFeedback').textContent='Chat is intentionally locked until the owner finishes spam and moderation testing. Guests will not need accounts when it opens.';
 }catch(e){
  setChat(false,'Room unavailable');renderMessages([]);renderPolls();
  $('chatFeedback').textContent='Community server features are being prepared: '+e.message;
  $('pollFeedback').textContent='Polls will appear once the Community backend is deployed.';
 }
 setInterval(()=>{if(!document.hidden&&chatEnabled)loadChat();},12000);
 setInterval(()=>{if(!document.hidden)loadPolls();},60000);
}
document.addEventListener('DOMContentLoaded',init);