/* Release availability is independent of saved navigation preferences.
 * This is a UI release gate; Supabase RLS remains the data security boundary. */
window.OnekanRelease = (() => {
 'use strict';
 const pages=Object.freeze({home:true,settings:true,all:false,schedule:false,todos:false,habits:false,work:false,timer:false,records:false,together:false,community:false});
 let owner=null,operator=false,preview=false,epoch=0,verification=0;
 const listeners=new Set();
 const canOpen=page=>Object.hasOwn(pages,page)&&(pages[page]||(operator&&!preview));
 function emit(){listeners.forEach(fn=>fn());}
 function bind(id){if(owner===id)return;owner=id;operator=false;preview=false;epoch++;emit();}
 async function verify(sb,id){bind(id);const stamp=epoch,request=++verification;if(!id)return;try{const {data,error}=await sb.auth.getUser();if(stamp!==epoch||request!==verification||id!==owner)return;if(error||data?.user?.id!==id)throw Error('identity');operator=data.user.app_metadata?.today_onekan_operator===true;}catch(_){if(stamp!==epoch||request!==verification)return;operator=false;}emit();}
 function setPreview(value){if(!operator)return;preview=!!value;emit();}
 return {pages,canOpen,bind,verify,setPreview,isOperator:()=>operator,isPreview:()=>preview,isRestricted:()=>!operator||preview,onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
})();
