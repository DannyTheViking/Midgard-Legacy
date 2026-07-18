const SUPABASE_URL = "https://mvjwsxzmdbtwtixowjym.supabase.co";
const SUPABASE_KEY = "sb_publishable_-Jc9ho5n63kRLK1VFc8Yxw_va8ffYVC";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =====================================
   LOG OUT
===================================== */
async function logoutGame() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout failed:", error);
        alert("Logout failed. Please try again.");
    }
}

// Sidebar/profile buttons are inserted after this script loads, so expose it globally.
window.logoutGame = logoutGame;


const signupButton=document.getElementById('signup-button');
if(signupButton) signupButton.addEventListener('click', async()=>{
 const username=document.getElementById('signup-username').value.trim(), email=document.getElementById('signup-email').value.trim(), password=document.getElementById('signup-password').value, genderIdentity=document.getElementById('signup-gender')?.value||'prefer_not_to_say';
 const out=document.getElementById('signup-message'); if(!username||!email||password.length<6){out.innerText='Enter a username, email and a password of at least 6 characters.';return;}
 const {data,error}=await supabaseClient.auth.signUp({email,password}); if(error){out.innerText=error.message;return;}
 const {error:playerError}=await supabaseClient.from('players').insert({id:data.user.id,username,email,gender_identity:genderIdentity,title_style:genderIdentity==='man'?'freeman':genderIdentity==='woman'?'freewoman':'freeperson',last_online:new Date().toISOString()});
 if(playerError){out.innerText=playerError.message;return;} await supabaseClient.from('skills').insert({player_id:data.user.id}); await supabaseClient.from('statistics').insert({player_id:data.user.id}); out.innerText='Your Viking has entered Midgard!';
});
const loginButton=document.getElementById('login-button');
if(loginButton) loginButton.addEventListener('click', async()=>{ const email=document.getElementById('login-email').value, password=document.getElementById('login-password').value; const {error}=await supabaseClient.auth.signInWithPassword({email,password}); if(error){document.getElementById('login-message').innerText=error.message;return;} window.location.href='home.html'; });

async function loadHomePage(){
 const {data:{user}}=await supabaseClient.auth.getUser(); if(!user){ if(!location.pathname.endsWith('login.html')&&!location.pathname.endsWith('signup.html')) window.location.href='login.html'; return; }
 const {data,error}=await supabaseClient.from('players').select('*').eq('id',user.id).single(); if(error){console.error(error);return;}
 const now=new Date(), last=new Date(data.last_regen||now), ticks=Math.floor(Math.floor((now-last)/60000)/5);
 if(ticks>0){ const gain=ticks*5; for(const stat of ['health','energy','stamina','courage']) data[stat]=Math.min(Number(data[stat]||0)+gain,Number(data['max_'+stat]||100)); data.last_regen=now.toISOString(); await supabaseClient.from('players').update({health:data.health,energy:data.energy,stamina:data.stamina,courage:data.courage,last_regen:data.last_regen}).eq('id',user.id); }
 await supabaseClient.from('players').update({last_online:now.toISOString()}).eq('id',user.id);
 const set=(id,v)=>{const e=document.getElementById(id);if(e)e.innerText=v};
 set('username',data.username); set('home-username',data.username); set('level',data.level||1); set('reputation',Number(data.reputation||0).toLocaleString()); set('rank',reputationTitle(data.reputation)); set('player-rank',reputationTitle(data.reputation)); set('silver',Number(data.silver||0).toLocaleString()); set('silver-card',Number(data.silver||0).toLocaleString()); set('health',`${data.health||0} / ${data.max_health||500}`); set('energy',`${data.energy||0} / ${data.max_energy||100}`); set('stamina',`${data.stamina||0} / ${data.max_stamina||100}`); set('courage',`${data.courage||0} / ${data.max_courage||100}`);
}
