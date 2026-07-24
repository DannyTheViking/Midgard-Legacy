function transportWeight(items){return (items||[]).reduce((sum,row)=>sum+Number(row.quantity||0)*Number(row.items?.weight_kg||0),0);}
function transportWeightText(value){const n=Number(value||0);return `${n.toFixed(n<10?2:1)}kg`;}
async function loadCartCard(){
 const host=document.getElementById('resource-cart-card');if(!host)return;
 const {data:{user}}=await supabaseClient.auth.getUser();if(!user)return;
 const {data:cart}=await supabaseClient.from('player_carts').select('*').eq('player_id',user.id).eq('is_active',true).maybeSingle();
 if(!cart){host.innerHTML='<h3>🎒 Backpack Transport</h3><p>No cart is attached. Gathered resources enter your 25kg Backpack.</p><p class="muted">Repair the abandoned handcart in your Wagon Shed for 100kg capacity.</p>';return;}
 const {data:items}=await supabaseClient.from('cart_items').select('quantity,items(name,weight_kg)').eq('cart_id',cart.id);
 const used=transportWeight(items),capacity=Number(cart.capacity_kg||cart.capacity||100),percent=Math.min(100,capacity?used/capacity*100:0);
 host.innerHTML=`<h3>🛒 ${cart.name}</h3><div class="transport-capacity"><div class="transport-capacity-row"><strong>Weight</strong><span>${transportWeightText(used)} / ${transportWeightText(capacity)}</span></div><div class="weight-bar"><span style="width:${percent}%"></span></div></div>${(items||[]).map(x=>`<p>${x.items?.name||'Item'}: ${x.quantity} (${transportWeightText(Number(x.quantity)*Number(x.items?.weight_kg||0))})</p>`).join('')||'<p>Empty</p>'}`;
}
async function addResourceToCartOrInventory(playerId,itemId,amount){
 const {data:cart}=await supabaseClient.from('player_carts').select('*').eq('player_id',playerId).eq('is_active',true).maybeSingle();if(!cart)return false;
 const [{data:item,error:itemError},{data:rows,error:rowsError}]=await Promise.all([
   supabaseClient.from('items').select('weight_kg').eq('id',itemId).single(),
   supabaseClient.from('cart_items').select('quantity,items(weight_kg)').eq('cart_id',cart.id)
 ]);
 if(itemError)throw itemError;if(rowsError)throw rowsError;
 const used=transportWeight(rows),added=Number(amount||0)*Number(item.weight_kg||0),capacity=Number(cart.capacity_kg||cart.capacity||100);
 if(used+added>capacity+0.000001)throw new Error(`Your ${cart.name} is full. ${transportWeightText(used)} / ${transportWeightText(capacity)} used. Unload it at your Storage Yard.`);
 const {data:existing}=await supabaseClient.from('cart_items').select('*').eq('cart_id',cart.id).eq('item_id',itemId).maybeSingle();
 const result=existing?await supabaseClient.from('cart_items').update({quantity:Number(existing.quantity)+Number(amount)}).eq('id',existing.id):await supabaseClient.from('cart_items').insert({cart_id:cart.id,item_id:itemId,quantity:amount});
 if(result.error)throw result.error;return true;
}
loadCartCard();
