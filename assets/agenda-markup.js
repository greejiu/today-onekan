/* Approved home markup, shared without home state or event handlers. */
(function(root){
const AG_TL_SLOT_MIN=15,AG_TL_ROW_PX=9,AG_TL_MIN_ITEM_PX=20;
function timeline(items,dateStr,options){
    let minM = options.min, maxM = options.max; // 설정 페이지에서 정한 하루 범위(기본 06:00~24:00) — 항목이 범위 밖이면 자동으로 더 넓어짐
    items.forEach(it => {
      minM = Math.min(minM, it.start_minute);
      maxM = Math.max(maxM, it.start_minute + it.duration_minutes);
    });

    const slotCount = Math.max(1, Math.ceil((maxM - minM) / AG_TL_SLOT_MIN));
    const rowOf = (m) => Math.floor((m - minM) / AG_TL_SLOT_MIN) + 1;

    let rowsHtml = "";
    for (let i = 0; i < slotCount; i++) {
      const m = minM + i * AG_TL_SLOT_MIN;
      if (m % 30 === 0) {
        rowsHtml += `<div class="tl-row-line${m % 60 === 0 ? " hour" : ""}" data-minute="${m}" style="grid-row:${i+1}"></div>`; // 정시 선은 진하게, 30분 선은 연하게(CSS)
        if (m % 60 === 0) rowsHtml += `<div class="tl-row-label" style="grid-row:${i+1}">${options.time(m)}</div>`;
      }
    }
    // 항목이 화면에 실제로 차지하는 세로 범위(px).
    // 15분처럼 짧은 항목은 실제 칸 높이(AG_TL_ROW_PX)로는 체크박스+글자가 다 안 들어가서 잘려버리므로 최소 높이를 보장.
    const boxOf = (it) => {
      const sRow = rowOf(it.start_minute), eRow = Math.max(sRow + 1, rowOf(it.start_minute + it.duration_minutes));
      const top = (sRow - 1) * AG_TL_ROW_PX;
      return { top, height: Math.max(AG_TL_MIN_ITEM_PX, (eRow - sRow) * AG_TL_ROW_PX) };
    };
    // 같은 시간대에 겹치는 항목은 나란히 배치(2개 겹치면 2열, 3개면 3열 …) — 겹치는 묶음(cluster) 단위로
    // 그 묶음 안 최대 동시 개수만큼 열을 나눔(캘린더 앱들이 흔히 쓰는 구간 색칠 방식).
    // 09-24 버그 수정: 겹침 판정을 "분"이 아니라 위 boxOf의 화면 범위로 함 — 분 기준이면 12:00(15분)·12:15처럼
    // 시간상 안 겹쳐도 최소 높이 때문에 화면에선 겹치는 항목이 같은 열에 놓여 뒤 항목이 앞 항목을 덮어버렸음.
    const placements = options.layout(items, boxOf);

    let itemsHtml = "";
    placements.forEach(({ item: it, col, colCount }) => {
      const { top, height } = boxOf(it);
      // 제목이 보일 수 있는 줄 수(패딩·테두리 6px 제외, 줄 높이 12px×1.3 — 2px까지는 살짝 넘쳐도 한 줄로 쳐줌)
      const titleLines = Math.max(1, Math.floor((height - 6 + 2) / (12 * 1.3)));
      const widthPct = 100 / colCount;
      const leftPct = widthPct * col;
      itemsHtml += `<div class="ag-tl-task ${it.kind} ${it.done ? "done" : ""}${options.skipped(it,dateStr)}" data-id="${it.id}" data-kind="${it.kind}"${options.attrs(it,dateStr)} data-period-label="${options.escape(it.period_label||'')}" title="${options.escape(it.period_label||'')}" data-occurrence="${it.occurrence_date||''}" data-start="${it.start_minute}" data-duration="${it.duration_minutes}" style="top:${top}px;height:${height}px;left:${leftPct}%;width:calc(${widthPct}% - 4px);${options.style(it)}">
        ${options.lead(it,dateStr)}
        <span class="ag-tl-title" style="-webkit-line-clamp:${titleLines}">${options.title(it)}</span>
        ${options.more(it)}
      </div>`;
    });
    const html = `<div class="ag-tl-grid" style="grid-template-rows:repeat(${slotCount},${AG_TL_ROW_PX}px)">${rowsHtml}<div class="ag-tl-content" data-date="${dateStr}" data-min-m="${minM}" data-max-m="${maxM}">${itemsHtml}</div></div>`;
    return {html,min:minM,max:maxM};
}
function blocks(items,dateStr,options){
    let html = "";
    if (options.blocks.length) {
      const covered = new Set();
      options.blocks.forEach(block => {
        const inBlock = items.filter(it => it.start_minute >= block.start_minute && it.start_minute < block.end_minute);
        inBlock.forEach(it => covered.add(it));
        const bs = options.blockStyle(block.title);
        html += `<div class="ag-section-head">
          <span class="label"><span class="ag-dot" style="background:${bs.dot};"></span>${options.escape(block.title)} <span style="color:var(--sub);font-weight:400;">(${options.time(block.start_minute)}~${options.endTime(block.end_minute)})</span></span>
        </div>`;
        // 비어있을 땐 "일정 없음" 안내문구 자체가 곧 클릭해서 추가하는 빈칸(하루종일·언젠가와 동일 규칙),
        // 이미 항목이 있으면 그 아래에 "+ 추가" 줄만 따로 붙임.
        // data-date: 이 블럭 카드가 어느 열(날짜) 소속인지(8-3단계, homeDropZone이 드롭 대상 날짜를 여기서 읽음).
        html += inBlock.length
          ? `<div class="agenda-flat ag-block-card" data-block-start="${block.start_minute}" data-date="${dateStr}">${inBlock.map(it => options.row(it,dateStr)).join("")}${options.addSlot(`data-block-start="${block.start_minute}"`, false)}</div>`
          : `<div class="agenda-flat ag-block-card" data-block-start="${block.start_minute}" data-date="${dateStr}">${options.addSlot(`data-block-start="${block.start_minute}"`, true)}</div>`;
      });
      const uncovered = items.filter(it => !covered.has(it));
      if (uncovered.length) {
        html += `<div class="ag-section-head"><span class="label">그 외 시간</span></div>`;
        html += `<div class="agenda-flat">${uncovered.map(it => options.row(it,dateStr)).join("")}</div>`;
      }
    } else if (items.length) {
      html += `<div class="agenda-flat">${items.map(it => options.row(it,dateStr)).join("")}</div>`;
    }
    return html || `<div class="empty" style="padding:20px 0;font-size:12px;">시간이 있는 항목이 없어요.</div>`;
}
function colorStyle(color){if(!color)return `background:var(--card);border-color:var(--line);`;return `background:color-mix(in srgb, ${color} 24%, var(--card));border-color:color-mix(in srgb, ${color} 50%, var(--line));`;}
root.OnekanAgendaMarkup={timeline,blocks,colorStyle};
})(window);
