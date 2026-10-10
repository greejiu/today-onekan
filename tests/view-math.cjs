// 공용 시간 줄 나누기(겹치는 항목은 옆 칸으로) 순수 계산 — 브라우저 없이 실행. (옛 schedule-views.cjs에서 옮김, 2026-10-10)
const assert=require('node:assert/strict');
const {lanes}=require('../assets/schedule-views.js');
assert.deepEqual(lanes([{id:1,start_minute:0,duration_minutes:60},{id:2,start_minute:30,duration_minutes:60},{id:3,start_minute:90,duration_minutes:30}]).map(x=>[x.id,x.lane,x.columns]),[[1,0,2],[2,1,2],[3,0,1]]);
assert.deepEqual(lanes([{id:1,start_minute:0,duration_minutes:30},{id:2,start_minute:30,duration_minutes:30}]).map(x=>[x.id,x.lane,x.columns]),[[1,0,1],[2,0,1]],'끝과 시작이 맞닿으면 겹침 아님');
assert.deepEqual(lanes([]),[]);
console.log('PASS view math: lanes overlap/adjacent/empty');
