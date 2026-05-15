/**
 * Skill tree content for the pixel-medical theme.
 *
 * 36 medical-flavored nodes (4 stats × 9 nodes). Sprite keys reuse the engine
 * fallback naming (`skill-placeholder-<stat>-<n>`) so SPRITE_MAP can register
 * real PNGs later without changing this content file. While SPRITE_MAP lacks
 * those keys, the UI component renders a CSS placeholder.
 */

import type { SkillTreeContent } from '@study-rpg/core'

function nodes(stat: 'knowledge' | 'reflex' | 'memory' | 'stamina', items: Array<[string, string]>) {
  return items.map(([name, flavor], i) => ({
    spriteKey: `skill-placeholder-${stat}-${i + 1}`,
    name,
    flavor,
  }))
}

export const SKILL_TREE_PIXEL_MEDICAL: SkillTreeContent = {
  branches: [
    {
      statKey: 'knowledge',
      nodes: nodes('knowledge', [
        ['翻書術 I', '從硬讀邁出第一步，把書打開就是勝利的一半。'],
        ['速讀術', '文字流過眼角不再卡頓，章節翻得比看小說還順。'],
        ['索引心法', '知識在腦中自動分類，提到主題就想得起章節位置。'],
        ['鑑別診斷', '看到一組症狀就能想到三個以上可能診斷。'],
        ['病理鏡像', '機制圖譜在腦內成像，藥理路徑像地鐵圖。'],
        ['跨科連結', '內科外科互通有無，一個病能從四個角度切。'],
        ['經典背誦', 'Harrison 章節編號倒背，guideline 哪一頁也記得。'],
        ['主治直覺', '不靠 reference 也能下決定，理由講得清。'],
        ['教科書活字典', '後輩追著問都答得出來，連例外都記得。'],
      ]),
    },
    {
      statKey: 'reflex',
      nodes: nodes('reflex', [
        ['起手反應 I', '不再卡在第一題，看到題目立刻開始讀。'],
        ['計時直覺', '30 秒內鎖定關鍵字，題幹掃完知道考點。'],
        ['倒退快選', '看完最後一題立刻交卷，不再回頭折磨自己。'],
        ['答案掃描', '五個選項 5 秒掃完，明顯的先排除。'],
        ['排除法熟練', '兩個錯誤先丟，剩下三個再仔細比。'],
        ['命中第一直覺', '改答案前先停三秒，多半第一個是對的。'],
        ['模擬考節奏', '80 題 80 分鐘穩穩走，不超時也不剩太多時間。'],
        ['考場心流', '別人翻紙聲不再分心，題目就在眼前。'],
        ['國考級反應', '連續八小時不掉速，最後一題還能想清楚。'],
      ]),
    },
    {
      statKey: 'memory',
      nodes: nodes('memory', [
        ['短期記憶 I', '今天讀的還記得三天，週末不用全部重來。'],
        ['卡片回憶', 'Anki due 不再堆積，每天清得完。'],
        ['圖像聯想', '記得藥名也記得作用機轉，不再背完就忘。'],
        ['上下文鎖定', '課堂例子永遠在腦海，老師講過的 case 都還記得。'],
        ['SR 重溫', '一週後再看仍清晰，間隔複習真的有效。'],
        ['月度回流', '一個月後測驗仍 80% 正確，知識穩定下來。'],
        ['半年穩定', 'Step 1 概念半年後抓得回，臨床用得上。'],
        ['終身記憶', '病房用上幾乎不用 google，腦袋就是 reference。'],
        ['大腦圖書館', '看一次就放對位置，要用的時候自動浮上來。'],
      ]),
    },
    {
      statKey: 'stamina',
      nodes: nodes('stamina', [
        ['起步耐力 I', '每天讀 30 分鐘，破除「明天再開始」迴圈。'],
        ['持續閱讀', '進度條動起來，章節一頁一頁推進。'],
        ['一坐三小時', '屁股長根，咖啡再喝一杯就能撐到午餐。'],
        ['圖書館長住客', '不到打烊不回家，警衛開始認得你。'],
        ['晨讀者', '早上六點開始，腦袋最清醒的時段用來讀最難的。'],
        ['夜貓子模式', '凌晨兩點還清醒，安靜的時候特別專注。'],
        ['長征選手', '跑完一個 semester 還能讀，沒有 burnout。'],
        ['馬拉松手', 'Step 2 八週備考無傷，每天都進度。'],
        ['終極續航', '國考週連讀七天不崩，最後一天還能 100% 投入。'],
      ]),
    },
  ],
}
