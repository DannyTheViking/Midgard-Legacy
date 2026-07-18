async function board(title,column,formatter=v=>v){const {data}=await supabaseClient.from('players').select(`id,username,${column}`).order(column,{ascending:false}).limit(10);return `<section class="card"><h3>${title}</h3>${(data||[]).map((p,i)=>`<p>${i+1}. <a href="profile.html?id=${p.id}">${p.username}</a> — ${formatter(p[column]||0)}</p>`).join('')||'<p>No players yet.</p>'}</section>`;}
async function loadHall(){
 await refreshMyNetWorth();
 document.getElementById('hof-grids').innerHTML=(await Promise.all([
  board('Village Reputation','reputation',v=>Number(v).toLocaleString()),
  board('Player Level','level'),
  board('Wealth Ranking','net_worth',v=>`${Number(v).toLocaleString()} value · ${wealthTitle(v)}`),
  board('Revivers','revive_count'),board('Jailbreakers','jailbreak_count'),board('PvP Victories','pvp_wins')
 ])).join('');
}
loadHall();
