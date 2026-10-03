/* Schedule adapter keeps the existing public entry point and geometry test API. */
(function(root){
 if(typeof module!=='undefined'){module.exports=require('./item-views.js');return;}
 root.createOnekanScheduleViews=api=>root.createOnekanItemViews(api);
})(typeof window==='undefined'?globalThis:window);
