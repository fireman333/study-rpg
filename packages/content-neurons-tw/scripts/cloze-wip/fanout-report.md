# 講義挖空字卡 fan-out（9 科）評分報告

本檔由 `grade/fanout-report.py` 產生，數字皆由程式從 `admitted.json`、`fanout-grades.json`（grader = `agent-pregrade`）、`grade/issues-fan-*.json`、`grade/verdict-fan-*.json` 計算。

## 評分彙整前要先知道的事

- 交辦是「merge-grades.py 寫進 `pilot-grades.json`」，但 `pilot-grades.json` 目前是試點的 **owner 採用版**（`grader: "owner"`，已 commit），merge-grades.py 的守衛拒絕覆寫（`refusing to overwrite it with agent grades`）。
- 處理方式：守衛不繞過、正本不動。以**原封不動的 merge-grades.py** 在 scratch 目錄（附 `admitted.json` 副本）跑一次，輸出搬到 `scripts/cloze-wip/fanout-grades.json`（`grader: "agent-pregrade"`）。本報告讀這份。
- 日後要 promote 這 9 科，需要決定 fan-out 評分如何併入 `pilot-grades.json`（例如由 owner 手動合併並保留試點的 owner 標記）。
- 同一張卡以後讀入的檔案為準：r1 先、r2 後；r2 涵蓋全部卡，所以最終成績＝r2 成績。

## 各科成績

good 率＝good ÷ 已評分卡數。及格門檻 good ≥ 70%。

| 科 | 考點數 | 有卡考點 | admitted | 已評分 | good | ordinary | bad | medical-error | 有洩題 (leak≠none) | 與考題衝突 | good 率 | 結果 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 組織學 | 25 | 22 | 49 | 49 | 36 | 6 | 7 | 2 | 4 | 0 | 73.5% | 及格 |
| 免疫學 | 28 | 28 | 72 | 72 | 41 | 20 | 11 | 0 | 7 | 0 | 56.9% | **不及格** |
| 公共衛生學 | 42 | 35 | 73 | 73 | 58 | 6 | 9 | 0 | 6 | 0 | 79.5% | 及格 |
| 微生物學 | 51 | 43 | 107 | 107 | 76 | 17 | 14 | 1 | 5 | 0 | 71.0% | 及格 |
| 生物化學 | 66 | 52 | 119 | 119 | 84 | 11 | 24 | 1 | 21 | 0 | 70.6% | 及格 |
| 生理學 | 66 | 53 | 97 | 97 | 68 | 14 | 15 | 1 | 10 | 0 | 70.1% | 及格 |
| 病理學 | 63 | 61 | 164 | 164 | 118 | 18 | 28 | 1 | 18 | 0 | 72.0% | 及格 |
| 藥理學 | 58 | 53 | 161 | 161 | 123 | 14 | 24 | 2 | 10 | 0 | 76.4% | 及格 |
| 解剖學 | 76 | 42 | 56 | 56 | 47 | 5 | 4 | 0 | 1 | 0 | 83.9% | 及格 |
| **全體** | 475 | 389 | 898 | 898 | 651 | 111 | 136 | 8 | 82 | 0 | **72.5%** | |

- admitted 但未評分：0 張；有成績但已不在 admitted：0 張。
- 全體 good 率 72.5%（651/898）；不及格科：免疫學（56.9%）。

### 被評為 medical-error 的卡（8 張）

| 科 | cardId | 評分理由 |
|---|---|---|
| 微生物學 | `antimicrobial-mechanisms-and-resistance#k3` | 114-2 Q4 正解A胺基醣苷類即卡答案，但句中稱capreomycin「皆屬胺基醣苷類」有誤（capreomycin為環狀多胜肽），卡背事實錯誤。 |
| 生物化學 | `fat-soluble-vitamins-adek#k2` | 112-2 Q91 維生素K 為 isoprenoid 衍生物一致，但卡面主張維生素D 是「唯一例外」不屬類異戊二烯——膽固醇本身經 mevalonate／isoprenoid 路徑合成，Lehninger 明列 A、D、E、K 皆為 isoprenoid 化合物，敘述錯誤。 |
| 生理學 | `higher-cortical-and-limbic-function#k1` | 110-2-Q48 答案 C temporal cortex 正確，但卡面把它解釋成「感覺性語言區（Wernicke）受損」；看不出物體形狀屬下顳葉腹側視覺路徑的物體失認，解釋錯誤。 |
| 病理學 | `bone-tumors#k4` | 111-1 Q79 正解A fibrous cortical defect，但卡面寫「2–3公分」病灶，與題幹0.3公分及教科書（FCD 多約0.5公分、長到5公分以上才稱 nonossifying fibroma）不符，卡面含醫學錯誤。 |
| 組織學 | `bone-histology-and-ossification#k3` | 104-2 Q35 給分點是透明軟骨不出現；骨針為正確選項但答案不唯一（骨小樑、編織骨皆可），且句中「由骨外膜內層骨生成細胞分化」「骨針構成初級骨髓」與組織學不符。 |
| 組織學 | `nervous-tissue-neuron-and-glia#k4` | 106-1 Q35 給分 A、C，gliosis 是正確選項 D；但卡面「大腦黑質」對應官方一併給分（判為錯誤）的選項 A，且稱寡突膠細胞共同增生形成 gliosis 不正確（主要為星狀膠細胞與微小膠細胞）。 |
| 藥理學 | `anesthetics-general-and-local#k1` | 106-1 Q58 誘導最快答 N2O 無誤，但句中稱 N2O 血氣分配係數為吸入麻醉劑最小、水溶性最大，與教科書（desflurane 0.42 < N2O 0.47）不符。 |
| 藥理學 | `beta-blockers-cardiovascular#k4` | 答案 glucagon 與 113-1 Q75 一致，但括號稱 theophylline、caffeine、metaproterenol 用於 β促效劑過量中毒是錯的（metaproterenol 本身即 β促效劑），醫學錯誤 |

## 講義問題（獨立複核 confirmed）

評分者回報 78 筆（`issues-fan-*.json`）；複核者全科 grep 同一錯誤後共 109 筆判決：fix 94、note 11、keep（誤報）4。另有 `sibling-fan-*.json` 旁支修正 2 筆。

**狀態：尚未套用到講義**——本次任務規則禁止改 `src/handout/*.html`。目前 105/105 筆的 `oldText` 在講義中恰好出現一次，可直接套用；其餘見下方「套用前要處理」。

`note` 的建議修正是在該 li 加 `hdt-intl` 註記（保留考題答案）；加註後該句會被閘門排除、不再出卡。

| 科 | issueId | 判決 | 講義原句（oldText） | 建議修正（newText） | 依據 |
|---|---|---|---|---|---|
| 組織學 | F001 | fix | 由骨外膜內層的骨生成細胞直接分化為成骨細胞、分泌類骨質並鈣化形成骨針（bone spicules），進一步構成初級骨髓； | 由骨化中心的間葉細胞（mesenchymal cell）直接分化為成骨細胞、分泌類骨質並鈣化形成骨針（bone spicules），骨針之間富含血管的結締組織則發展為初級骨髓； | 104-2-醫學一-組織學-Q35：104-2-Q35 答 C（透明軟骨不出現），A 類骨質／B 骨針／D 初級骨髓皆為膜內骨化會出現的構造，講義結論與官方答案一致、不受影響；但起始細胞寫錯：膜內骨化是骨化中心的間葉細胞直接分化為成骨細胞（此時尚無骨外膜，骨外膜是之後由周圍間葉形成；詳解寫的 periosteum precursor 是骨增粗／骨癒合的情境，非胚胎期膜內骨化），且初級骨髓由骨針之間富血管的結締組織發展而來，不是骨針「構成」。保留「類骨質、骨針、初級骨髓」三個考點。同檔表格另有同一錯誤，見 F001-b。 |
| 組織學 | F001-b | fix | <td>骨外膜內層骨生成細胞直接分化為成骨細胞，分泌類骨質並鈣化形成骨針</td> | <td>間葉細胞直接分化為成骨細胞，分泌類骨質並鈣化形成骨針</td> | 104-2-醫學一-組織學-Q35：全科 grep「骨外膜內層」找到的同一錯誤（組織學.html 膜內／軟骨內骨化比較表「機制」列），與 F001 同理一併修正。 |
| 組織學 | F002 | fix | 酶原顆粒（zymogen granule）呈嗜鹼性，皆與內分泌部無關。 | 腺泡細胞頂端的酶原顆粒（zymogen granule）呈嗜酸性（基底細胞質因粗糙內質網呈嗜鹼性），皆與內分泌部無關。 | 108-2-醫學一-組織學-Q42：108-2-Q42 答 B；D「嗜酸性的酶原顆粒」之所以錯是因為酶原顆粒屬外分泌部、與題幹「內分泌部」不合，官方答案不涉及顆粒染色。詳解稱「應為嗜鹼性」是詳解本身的錯誤：胰腺泡細胞頂端酶原顆粒在 H&E 呈嗜酸性，基底部因粗糙內質網呈嗜鹼性（Ross／Junqueira 一致）。全題庫無以「酶原顆粒嗜鹼性」為官方答案的題目（114-1-Q43 講的是胃主細胞整體細胞質嗜鹼，與此不衝突）；全科 grep 無其他同錯。 |
| 組織學 | F003 | fix | 由星狀膠細胞、微小膠細胞、寡突膠細胞共同增生形成。 | 主要由反應性星狀膠細胞增生、肥大形成（伴隨微小膠細胞活化）。 | 106-1-醫學一-組織學-Q35：106-1-Q35 選項 D「通常會有明顯的 gliosis」為正確敘述，講義保留此點；但 gliosis 是以反應性星狀膠細胞增生／肥大為主（伴微小膠細胞活化），寡突膠細胞並非增生成分，「三者共同增生」錯誤（病理學.html 亦寫星狀膠細胞反應含增生與肥大，一致）。黑質部分另見 F003-b。 |
| 組織學 | F003-b | fix | 病灶在大腦黑質與基底核的多巴胺分泌不足， | 病灶在中腦黑質（substantia nigra）緻密部的多巴胺神經元退化，使其投射到基底核（紋狀體）的多巴胺不足（官方不接受「大腦黑質及基底核神經元多巴胺分泌不足」的說法）， | 106-1-醫學一-組織學-Q35：106-1-Q35 官方 acceptedAnswers 為 [A, C]：選項 A「大腦黑質及基底核中神經元的多巴胺分泌不足」也被判為錯誤敘述，講義照抄 A 的說法即與官方答案相反。黑質位於中腦（106-2-解剖學-Q15 以黑質屬中腦為正確），且多巴胺神經元在黑質（緻密部）、投射至紋狀體，基底核本身的神經元並不分泌多巴胺（114-1-解剖學-Q4、109-1-解剖學-Q14 一致）。全科 grep「大腦黑質」僅此一處。 |
| 組織學 | F004 | note | 壁細胞、主細胞在賁門部並不出現。 | 壁細胞、主細胞在賁門部並不出現。<span class="hdt-intl">（⚠️ 國際教科書：賁門腺以黏液細胞為主，但可見少量壁細胞、偶有主細胞；考選部 106-2-Q41 以「壁細胞不存在於賁門」為正確敘述，作答以歷屆考題答案為準）</span> | 106-2-醫學一-組織學-Q41：106-2-醫學一-組織學-Q41（何者錯誤）答 C，選項 B「壁細胞不存在於賁門」被視為正確敘述，講義與官方答案一致；105-1-Q39 答 A（表面黏膜細胞最多）亦不衝突。國際教科書（Ross、Junqueira）記載賁門腺以黏液細胞為主、但可見少量壁細胞（偶有主細胞）→ 保留考題答案、加 hdt-intl 註記，不改為「極少見」以免與 106-2-Q41 衝突。全科 grep 無其他同類敘述。 |
| 免疫學 | F005 | fix | 主要靠感受<b>趨化因子受體（chemokine receptor）</b>的濃度梯度刺激而遷移 | 主要靠<b>趨化因子受體（chemokine receptor）</b>感受趨化因子的濃度梯度而遷移 | 109-2-醫學二-微生物暨免疫學-Q19：109-2 Q19 官方答案 C（chemokine receptors）支持「靠趨化因子受體」；但形成濃度梯度的是趨化因子（chemokine），細胞以受體感受梯度，原句把受體寫成梯度來源，屬概念錯置。只改主詞／受詞關係，不動考點。全 11 科 grep 無同一錯誤（濃度梯度他處皆為膜運輸語境）。（兩位評分者 r1-免疫學-1／r2-02 獨立回報一致；r1 的 examRef 109-1 Q18 為 M 細胞題，實際對應題為 109-2 Q19） |
| 免疫學 | F006 | fix | 面對真核寄生蟲與黴菌感染時反應比嗜中性球更強 | 面對真核寄生蟲感染時反應比嗜中性球更強 | 107-2-醫學二-微生物暨免疫學-Q24：107-2 Q24 官方答案 B；選項 C「真核寄生蟲感染時嗜中性白血球反應較強」為錯誤敘述，故支持「寄生蟲感染時嗜伊紅性白血球反應較強」，但題目未涉及黴菌。教科書：抗黴菌（Candida、Aspergillus）主力為嗜中性球（嗜中性球低下是侵襲性黴菌感染主要風險），「黴菌感染時嗜伊紅性白血球反應比嗜中性球強」為講義外推且錯誤。刪去「與黴菌」。全 11 科 grep「嗜伊紅…黴菌」僅此一處。 |
| 免疫學 | F007 | fix | 由 <b>Th1 細胞</b>主導（分泌較多 IL-12、IL-23） | 由 <b>Th1 細胞</b>主導（病灶中巨噬細胞／樹突細胞分泌較多 IL-12、IL-23，驅動 Th1／Th17 反應） | 105-2-醫學一-微生物暨免疫學-Q65：105-2 Q65 為否定題、官方答案 D（HLA-DQ2 是錯誤敘述），故選項 B「Th1 主導」為正確敘述，「由 Th1 細胞主導」需保留；104-2 Q65 答 C（IFN-γ 共同點）亦不受影響。但括號「分泌較多 IL-12、IL-23」緊接 Th1 細胞，讀成 Th1 分泌 IL-12/IL-23，與教科書不符（IL-12/IL-23 由巨噬細胞／樹突細胞分泌，分別驅動 Th1／Th17；Th1 分泌 IFN-γ）。改為明示由抗原呈現細胞分泌。下方比較表「Th1（IL-12、IL-23 主導）」未宣稱 Th1 分泌，可不改。全 11 科 grep 無同一錯誤（分枝桿菌段已正確寫『巨噬細胞分泌 IL-12』）。 |
| 免疫學 | F008 | fix | 是與TLR、NOD不同家族的細胞質PRR | 屬NOD樣受體（NLR）家族中的NLRP亞群（與NOD1／NOD2所屬的NLRC亞群不同），是細胞質PRR | 115-1-醫學二-微生物暨免疫學-Q19：115-1 Q19 官方答案 B（NLRP3）與講義一致，考點不受影響。但「與TLR、NOD不同家族」不正確：NLRP3 屬 NOD-like receptor（NLR）家族（NLRP 亞群），與 NOD1/NOD2（NLRC 亞群）同家族不同亞群。改寫為正確分類。全 11 科 grep 無他處相同敘述。 |
| 公共衛生學 | F009 | fix | 隨機分派的另一原則是盲法 | RCT 的另一原則是盲法 | 113-1-醫學二-公共衛生學-Q39; 104-1-醫學一-公共衛生學-Q91：113-1 Q39 答 B（隨機分組使干擾因子在兩組分布相似）支持前半句。104-1 Q91（何者錯誤，答 B）把 C「原則上不讓研究對象、資料蒐集者知道分組」列為正確敘述，但那是隨機分派試驗（RCT）的設計原則，並非隨機分派本身的機制；同檔另一 li 已寫「要分清盲性與隨機分派各自負責什麼」。改主詞為 RCT，不改變任何考題答案。 |
| 公共衛生學 | F011 | fix | 指非醫師執行「應由醫師親自執行」之醫療行為；若是在醫師指示下 | 泛指非醫師執行醫療行為（包括非醫師在醫師指示下執行「應由醫師親自執行」之行為）；唯一例外是非醫師在醫師指示下 | 105-1-醫學一-公共衛生學-Q100：105-1 Q100（不包括何者）官方答案 C，代表 A「非醫師執行應由醫師執行之醫療行為」、B「非醫師執行任何醫療行為」、D「非醫師在醫師指示下執行需由醫師親自執行之醫療行為」皆屬擅自執行醫療業務；講義定義限縮為只有「應由醫師親自執行」者，與 B 不一致。改為泛指非醫師執行醫療行為，唯一例外為 C。<b>不算</b> 與 cite 不動。 |
| 公共衛生學 | F012 | fix | 兩者都不受極端值影響 | 中位數與四分位距都較不受極端值影響 | 112-1-醫學二-公共衛生學-Q39：112-1 Q39 答 C（右偏資料用中位數+四分位距）。原句「兩者都不受極端值影響」可被讀成平均值+標準差與中位數+IQR 兩組，而平均值與標準差受極端值影響（同檔 104 li 亦明寫標準差受極端值牽動）；改為明確指中位數與四分位距，並用「較不受」。純措辭修正，不改考題答案。 |
| 微生物學 | F013 | fix | 兩者對哺乳類細胞毒性低的關鍵原因是<b>哺乳類細胞根本不自行合成葉酸（靠飲食攝取）</b>，而非哺乳類的相關酵素對藥物親和力低； | 磺胺類對哺乳類細胞毒性低的關鍵原因是<b>哺乳類細胞根本不自行合成葉酸（靠飲食攝取）</b>；甲氧苄啶的選擇性則來自它對<b>細菌</b>二氫葉酸還原酶的親和力遠高於人類的同一酵素； | 110-2-醫學二-微生物暨免疫學-Q3；111-1-醫學二-藥理學-Q56：110-2-Q3 答 C（哺乳類不合成葉酸）題幹只問磺胺類，支持前半句；但 trimethoprim 作用於 DHFR、哺乳類也有 DHFR，其選擇性正是來自對細菌 DHFR 的高親和力——111-1-醫學二-藥理學-Q56 官方答案 B「trimethoprim 對細菌 dihydrofolic acid reductase 具有專一性的高親和力」，生物化學.html、藥理學.html 也都這樣寫。原句把兩藥合併並否定親和力機轉，與 111-1 官方答案相反 → 拆開敘述。全科 grep「親和力」僅此處把 TMP 選擇性歸於「不合成葉酸」。 |
| 微生物學 | F014 | fix | （amikacin、capreomycin、kanamycin，皆屬胺基醣苷類） | （amikacin、kanamycin屬胺基醣苷類，capreomycin為環狀多胜肽類） | 114-2-醫學二-微生物暨免疫學-Q4：114-2-Q4 答 A（胺基糖苷）、114-1-Q8 題幹列出 kanamycin、amikacin、capreomycin 三種注射藥，官方答案只需「三種可注射二線藥物、含胺基糖苷」；capreomycin 是環狀多胜肽類（cyclic polypeptide），不是胺基醣苷類，講義「皆屬胺基醣苷類」為教科書錯誤，修正不影響任何官方答案。全科 grep capreomycin 另有兩處同錯，見 F014-b／F014-c。 |
| 微生物學 | F014-b | fix | 指對 kanamycin、amikacin、capreomycin 三種<b>二線注射型胺基糖苷類（aminoglycosides）</b>藥物中至少一種具抗藥性 | 指對 kanamycin、amikacin、capreomycin 三種<b>二線注射藥物</b>（前兩者為胺基糖苷類 aminoglycosides，capreomycin 為環狀多胜肽類）中至少一種具抗藥性 | 114-1-醫學二-微生物暨免疫學-Q8：全科 grep「capreomycin」找到的同一錯誤（XDR-TB 新舊定義 li），與 F014 同理；保留「舊定義對應至 114 年考題」的架構。 |
| 微生物學 | F014-c | fix | ＋對至少一種二線注射型胺基糖苷（amikacin／capreomycin／kanamycin）具抗藥性 | ＋對至少一種二線注射藥物（胺基糖苷 amikacin／kanamycin，或多胜肽類 capreomycin）具抗藥性 | 114-1-醫學二-微生物暨免疫學-Q8：同 F014，XDR-TB 定義表格舊定義列。 |
| 微生物學 | F015 | fix | 臨床上一律與penicillin類藥物合併使用（產生協同作用），不會單獨使用。 | 臨床上與β-lactam類藥物（多為penicillin類，如amoxicillin、ampicillin、piperacillin；tazobactam亦可與頭孢菌素ceftolozane併用）合併使用以產生協同作用，不會單獨使用。 | 113-1-醫學二-微生物暨免疫學-Q4：113-1-Q4 答 C「與青黴素合併使用可達協同作用」、107-1-Q9 選項 A「clavulanic acid 通常被單獨使用」為錯，兩題都只支持「不單獨使用、與 β-lactam 合用」；「一律與 penicillin 類」過度概括（tazobactam 亦與 ceftolozane 併用，藥理學.html 表格即有 ceftolozane-tazobactam、ceftazidime-avibactam）→ 放寬為 β-lactam 類、以 penicillin 類為主。 |
| 微生物學 | F016 | fix | 毒素僅在局部產生作用、不經血流散布全身； | 菌體停留在傷口局部、不會經血流散布全身（造成全身性破傷風的是毒素沿神經逆行並經血流散布，不是病菌本身）； | 105-2-醫學一-微生物暨免疫學-Q46；115-2-醫學二-微生物暨免疫學-Q8：105-2-Q46 答 C；選項 B「病菌會藉血流散佈全身」錯，錯的是「菌體」散布，不是毒素。破傷風痙攣毒素會沿運動神經逆行運輸、並可經血流／淋巴散布造成全身性破傷風；115-2-Q8 官方答案 B「TIG 中和未結合的毒素」也以毒素在循環中游離為前提，原句「毒素僅局部作用、不經血流」與此自相矛盾 → 主詞改回菌體。全科 grep「不經血流」僅此一處。 |
| 微生物學 | F017 | fix | 「臼齒狀菌落」（molar tooth colony）不是Actinomyces的專利，Nocardia與Propionibacterium propionicum在固體培養基上同樣可形成此特徵性粗糙、高低不平的菌落外觀。 | 「臼齒狀菌落」（molar tooth colony）是以色列放線菌（A. israelii）的經典特徵：在固體培養基上呈粗糙、高低不平的菌落外觀，Propionibacterium propionicum也可形成類似菌落；奴卡氏菌（Nocardia）的菌落則典型呈白堊狀、乾燥皺褶，不以臼齒狀描述。 | 114-1-醫學二-微生物暨免疫學-Q7：114-1-Q7 答 B，只考「以色列放線菌具臼齒狀菌落」；全題庫無任何題目以 Nocardia 形成臼齒狀菌落為正確答案。教科書（Murray、Sherris）臼齒狀菌落是 A. israelii 的經典描述（P. propionicum 可相似），Nocardia 菌落典型為白堊狀、乾燥皺褶，「Nocardia 同樣可形成」無依據，且會在卡片上教錯。同檔 hdt-teach 段落與 Actinomyces vs Nocardia 表格另有兩處同錯，見 F017-b／F017-c。 |
| 微生物學 | F017-b | fix | 兩者外觀都是絲狀、都能形成「臼齒狀菌落」，但 | 兩者外觀都是絲狀（「臼齒狀菌落」則是放線菌的招牌），但 | 114-1-醫學二-微生物暨免疫學-Q7：同 F017，coryneform 主題 hdt-teach 段落「兩者都能形成臼齒狀菌落」。 |
| 微生物學 | F017-c | fix | 兩者都可見皮膚菌足腫（mycetoma）、都可形成臼齒狀菌落（molar tooth colony） | 兩者都可見皮膚菌足腫（mycetoma）；臼齒狀菌落（molar tooth colony）則是Actinomyces的特徵 | 114-1-醫學二-微生物暨免疫學-Q7：同 F017，Actinomyces vs Nocardia 鑑別表「共同特徵」列。 |
| 微生物學 | F018 | fix | 利用<b>PrPSc會自發聚合成纖絲（prion fibril）</b>的特性，透過震盪誘導聚合反應 | 利用<b>PrPSc會聚集成纖絲（prion fibril）</b>的特性：檢體中的PrPSc作為種子，透過震盪誘導正常PrP轉形並聚合 | 113-1-醫學二-微生物暨免疫學-Q12：113-1-Q12 答 B「PrPSc 會聚集成纖絲」，講義結論一致；但 RT-QuIC 的原理是檢體中 PrPSc 作為種子、在震盪下誘導重組 PrPC 轉形並聚合成纖絲（seeded conversion），「自發聚合」不精確。改寫後仍保留官方答案「PrPSc 聚集成纖絲」。同檔普里昂總表另有一處，見 F018-b。 |
| 微生物學 | F018-b | fix | RT-QuIC：利用PrPSc自發聚合成纖絲的特性快速偵測 | RT-QuIC：以檢體中PrPSc為種子、誘導正常PrP聚合成纖絲而快速偵測 | 113-1-醫學二-微生物暨免疫學-Q12：同 F018，普里昂特性總表「新型檢驗」列。 |
| 微生物學 | F019 | fix | 可存在於細胞外（因異常摺疊無法固定於細胞膜） | 可存在於細胞外（可聚集成細胞外類澱粉斑塊） | 104-2-醫學一-微生物暨免疫學-Q56：104-2-Q56 答 D（引起強免疫反應不是特性），選項 C「可存在於細胞外」為正確敘述，講義保留此點；但括號的因果解釋錯誤：PrPSc 多仍帶 GPI 錨定於細胞膜或在細胞內（內體／溶酶體）堆積，可存在於細胞外是因為會聚集成細胞外類澱粉斑塊，不是「無法固定於細胞膜」。全科 grep「無法固定」僅此一處。 |
| 微生物學 | F020 | fix | 因含活病原，<b>不適用於</b>60歲以上等免疫力較弱族群，這類族群應改用去活性疫苗。 | 因含活病原，<b>不適用於</b>50歲以上成人（考題問的60歲以上自然也不適用）、孕婦及免疫功能低下者，這類族群應改用去活性疫苗。 | 109-2-醫學二-微生物暨免疫學-Q13：109-2-Q13（何者錯誤）答 D「適用於60歲以上之成人」→ 官方答案只要求「60歲以上不適用」，講義與之一致、並無錯誤，但門檻不完整：LAIV 核准年齡 2–49 歲，50 歲以上即不建議，孕婦與免疫功能低下者也不適用。改寫後「60歲以上不適用」仍成立，不與 109-2 官方答案衝突。 |
| 微生物學 | F021 | fix | <b>漢他病毒（Hantaan virus）是布尼亞病毒目中唯一以囓齒類（而非節肢動物）傳播者</b> | <b>漢他病毒（Hantaan virus）是傳統布尼亞病毒科（Bunyaviridae）中唯一以囓齒類（而非節肢動物）傳播者</b>（現行分類併為布尼亞病毒目後，同目的沙狀病毒也經囓齒類傳播） | 107-1-醫學二-微生物暨免疫學-Q10：107-1-Q10 答 A（漢坦病毒），題幹是「本雅病毒（Bunyaviruses）大多藉由節肢動物傳播」——即傳統布尼亞病毒科的範圍。現行 ICTV 分類中沙狀病毒科（Arenaviridae）也屬布尼亞病毒目且經囓齒類傳播，「布尼亞病毒目中唯一」不成立；改以傳統科為範圍，官方答案不變。同主題 hdt-teach 段落另有同一說法，見 F021-b。 |
| 微生物學 | F021-b | fix | 布尼亞病毒目大多經節肢動物傳播，<b>漢他病毒是唯一的例外</b>（囓齒類傳播）； | 傳統布尼亞病毒科大多經節肢動物傳播，<b>漢他病毒是唯一的例外</b>（囓齒類傳播；現行分類同屬布尼亞病毒目的沙狀病毒也經囓齒類傳播）； | 107-1-醫學二-微生物暨免疫學-Q10：同 F021，bunya-arena-filoviridae 主題 hdt-teach 段落。 |
| 微生物學 | F022 | fix | 也就是永生化（immortalization）</b>（本題正解）； | 也就是永生化（immortalization）</b>； | 115-2-醫學二-微生物暨免疫學-Q16：115-2-Q16 答 C（轉型細胞即成為永生細胞），講義內容正確；「（本題正解）」是編寫殘留字樣，脫離考題後語意不明，刪除。全 11 科 grep「本題正解」另有 11 處同樣殘留（病理 4、生理 1、解剖 6），見 F022-b 起；均只刪殘留字樣、不動內容。 |
| 微生物學 | F023 | note | 最主要天然宿主是<b>人類</b>（非洲靈長類為次要宿主）； | 最主要天然宿主是<b>人類</b>（非洲靈長類為次要宿主）<span class="hdt-intl">（⚠️ 國際教科書：非洲非人靈長類與森林型斑蚊構成森林循環的天然儲存宿主，人類是都市流行時的主要擴增宿主；作答以歷屆考題答案為準）</span>； | 108-2-醫學二-微生物暨免疫學-Q13：108-2-Q13「人類是下列何種病毒中最明確的天然宿主」官方答案 D 基孔肯雅病毒，講義與官方答案一致；但教科書（Fields、Murray）以非洲非人靈長類＋森林型斑蚊為森林循環的天然儲存宿主，人類是都市流行（人–蚊–人）時的主要擴增宿主 → 保留考題答案、加 hdt-intl 註記。同檔病毒宿主表「人類（主要）、非洲靈長類（次要）」為表格儲存格，不出卡，暫不加註。 |
| 生物化學 | F024 | fix | 維生素A、E、K都是類異戊二烯（isoprenoid）衍生物；維生素D是唯一例外，前驅物為膽固醇（經7-dehydrocholesterol轉化，不是isoprenoid路徑）。 | 維生素A、E、K的結構直接由類異戊二烯（isoprenoid）單位構成；維生素D則以膽固醇為前驅物（經7-dehydrocholesterol照光轉化而來），而膽固醇本身也是經mevalonate／isoprenoid路徑合成。 | 106-2-醫學一-生物化學-Q78：106-2 Q78 答 B（膽固醇是維生素D前驅物）、112-2 Q91 答 C（維生素K為 isoprenoid 衍生物），兩題都只考前驅物，未支持「D 不是 isoprenoid 路徑」。膽固醇本身經 mevalonate／isoprenoid 路徑合成，Lehninger 將 A、D、E、K 皆列為 isoprenoid 化合物；改寫為 A/E/K 直接由 isoprenoid 單位構成、D 由膽固醇轉化而來，兩題答案皆不受影響。（重複群組：F024 含 r2-07 回報） |
| 生物化學 | F025 | fix | 經<b>生物素依賴羧化</b>轉成 succinyl-CoA | 經<b>生物素依賴羧化</b>成 methylmalonyl-CoA，再由維生素B12依賴的 methylmalonyl-CoA mutase 轉成 succinyl-CoA | 108-2-醫學一-生物化學-Q89：108-2 Q89 答 B（succinyl-CoA），講義結論正確；但 propionyl-CoA 經生物素依賴的 propionyl-CoA carboxylase 羧化的直接產物是 methylmalonyl-CoA，需再經 B12 依賴的 methylmalonyl-CoA mutase 才成 succinyl-CoA（講義胺基酸代謝段落亦如此寫）。補上中間步驟，答案不受影響。（重複群組：F025 含 r2-07 回報） |
| 生物化學 | F026 | note | 不是 GTP、AMP 或 UMP。<cite>104</cite> | 不是 GTP、AMP 或 UMP。<span class="hdt-intl">（⚠️ 國際教科書：膽鹼經 CDP-choline 路徑（需 CTP）合成的是 phosphatidylcholine；哺乳類 phosphatidylserine 由 PC／PE 與 serine 鹼基交換生成，不直接利用膽鹼；作答以歷屆考題答案為準）</span><cite>104</cite> | 104-2-醫學二-生物化學-Q42：104-2 Q42 題幹即為「哺乳類利用膽鹼合成 phosphatidylserine」，官方答案 B（CTP），講義與官方答案一致。教科書上膽鹼經 CDP-choline 路徑（需 CTP）合成的是 phosphatidylcholine，哺乳類 PS 由 PC／PE 與 serine 鹼基交換生成、不直接用膽鹼 → 保留答案、加 hdt-intl 註記（該句之後被 excluded-source 排除為預期行為）。 |
| 生物化學 | F027 | note | phosphocholine，是磷脂醯膽鹼（phosphatidylcholine）生合成的重要步驟。<cite>112</cite> | phosphocholine，是磷脂醯膽鹼（phosphatidylcholine）生合成的重要步驟。<span class="hdt-intl">（⚠️ 國際教科書：哺乳類肝臟的 PEMT 以 SAM 三步甲基化的受質是 phosphatidylethanolamine（PE→PC），phosphoethanolamine→phosphocholine 的甲基化主要見於植物；作答以歷屆考題答案為準）</span><cite>112</cite> | 112-1-醫學一-生物化學-Q77：112-1 Q77 題幹即為「人類肝細胞中提供甲基使 phosphoethanolamine 轉換成 phosphocholine」，官方答案 D（SAM），講義與官方答案一致。教科書上哺乳類肝臟 PEMT 以 SAM 三步甲基化的受質是 phosphatidylethanolamine（磷脂層級），phosphoethanolamine→phosphocholine 的甲基化主要見於植物 → 保留答案、加 hdt-intl 註記。同一考點在 phospholipid-sphingolipid-metabolism 另有一句，見 F027-sib。 |
| 生物化學 | F027-sib | note | 不直接提供甲基。<cite>112</cite> | 不直接提供甲基。<span class="hdt-intl">（⚠️ 國際教科書：哺乳類肝臟的 PEMT 甲基化受質是 phosphatidylethanolamine（PE→PC），不是 phosphoethanolamine；作答以歷屆考題答案為準）</span><cite>112</cite> | 112-1-醫學一-生物化學-Q77：F027 同錯誤 grep 結果：同科 phospholipid-sphingolipid-metabolism 段落「肝細胞內把 phosphoethanolamine 轉換成 phosphocholine 需要甲基供體 SAM」同樣出自 112-1 Q77 題幹寫法，官方答案 D（SAM）一致 → 同樣加 hdt-intl 註記。其他 10 科講義無 phosphoethanolamine 字樣。 |
| 生物化學 | F028 | fix | 原核細胞表現載體（expression vector）的必要構造是<b>核糖體結合區 | 原核細胞表現載體（expression vector）除了<b>啟動子（promoter）</b>與多選殖位點（multiple cloning sites）外，必要構造還有<b>核糖體結合區 | 105-2-醫學二-生物化學-Q49：105-2 Q49 題幹前提為「除了啟動子及多選殖位點外」，答 D（RBS＋轉錄終止序列）；115-1 Q99 答 B（RBS＋啟動子）。講義漏寫前提，讀起來像啟動子非必要，與 115-1 Q99 衝突；補上前提，兩題答案皆一致。（重複群組：F028 含 r2-08 回報） |
| 生物化學 | F029 | fix | 胱天冬醯胺 | 天門冬醯胺 | 112-2-醫學一-生物化學-Q94：112-2 Q94 題幹用語為「天門冬醯胺（asparagine）」；「胱天冬醯胺」為錯誤譯名，易與胱胺酸混淆。純譯名修正，答案（C 生酮性為錯）不受影響。全 11 科僅此一處。（重複群組：F029 含 r2-08 回報） |
| 生物化學 | F030 | fix | <b>戊二烯基化（prenylation／farnesylation）</b> | <b>異戊二烯化（prenylation；Ras 為法尼基化 farnesylation）</b> | 113-1-醫學一-生物化學-Q83：113-1 Q83 答 D（prenylation），題目只用英文。prenylation 通用譯名為「異戊二烯化」，farnesylation 為「法尼基化」，「戊二烯基化」非標準譯名（且碳數意涵錯誤）。同科另有教學段與對照表兩處同一譯名，見 F030-sib1／F030-sib2。（重複群組：F030 含 r2-09 回報） |
| 生物化學 | F030-sib1 | fix | 羥化、戊二烯基化等修飾 | 羥化、異戊二烯化等修飾 | 113-1-醫學一-生物化學-Q83：F030 同錯誤 grep 結果：同段 hdt-teach 引言同一非標準譯名，一併改為異戊二烯化。 |
| 生物化學 | F030-sib2 | fix | <td>戊二烯基化（prenylation）</td> | <td>異戊二烯化（prenylation）</td> | 113-1-醫學一-生物化學-Q83：F030 同錯誤 grep 結果：同段修飾對照表同一非標準譯名，一併改為異戊二烯化。其他 10 科講義無「戊二烯」字樣。 |
| 生物化學 | F031 | fix | 訊號序列引導其進入分泌顆粒；水解成胰島素原（proinsulin）後 | 訊號序列引導其進入內質網腔，切除訊號肽後成為胰島素原（proinsulin），經高基氏體包入分泌顆粒後 | 105-1-醫學二-生物化學-Q49：105-1 Q49 答 B（A/B 鏈由兩基因轉錄為錯），選項 A「在內質網合成」與 D「合成後進入分泌顆粒」為正確敘述。但訊號序列引導新生肽鏈進入的是內質網腔，切除訊號肽成 proinsulin 後才經高基氏體包入分泌顆粒；修正機轉，仍保留「進入分泌顆粒」與考題一致。（考題實為 105-1-醫學二-生物化學-Q49） |
| 生物化學 | F032 | note | 形成儲存庫。<cite>109</cite> | 形成儲存庫。<span class="hdt-intl">（⚠️ 國際教科書：內質網腔游離 Ca²⁺ 約 0.1–0.8 mM，與細胞外液（約 1–2 mM）相當或略低，但遠高於細胞質（約 0.1 µM）；作答以歷屆考題答案為準）</span><cite>109</cite> | 109-2-醫學一-生物化學-Q98：109-2 Q98 為否定題，官方答案 D；選項 B「鈣離子濃度在細胞內質網內高於在細胞外液」因此被視為正確敘述，講義與官方答案一致。教科書 ER 腔內游離 Ca²⁺ 約 0.1–0.8 mM，與細胞外液（約 1–2 mM）相當或略低 → 保留答案、加 hdt-intl 註記。生理學／藥理學講義無同樣說法。（重複群組：F032 含 r2-09 回報） |
| 生物化學 | F033 | fix | ——不是脂肪酸過多時活化，正常生理生化沒有「固醇過多就啟動分解代謝」這種負回饋路徑。 | ——不是經由切斷連結的脂肪酸而活化，而是由高基氏體的蛋白酶（S1P／S2P）切割釋出；固醇充足時 SREBP 經 SCAP–Insig 被留在內質網、不被活化。 | 104-1-醫學二-生物化學-Q40：104-1 Q40 為否定題，答 B（經由切斷連結的脂肪酸而活化為錯），A/C/D 與講義一致。但「正常生理生化沒有固醇過多就啟動分解代謝的負回饋路徑」過度斷言：固醇過多時有 ACAT 酯化、LXR 促 ABCA1 外排與 CYP7A1 轉膽酸等路徑；刪去此說法，改寫成與考題選項 B 對應的正確機轉。 |
| 生物化學 | F034 | fix | <b>十字型（cruciform）</b>三級構造 | <b>十字型（cruciform）</b>二級結構 | 105-2-醫學二-生物化學-Q30：105-2 Q30 題幹「可以形成何種二級結構」，答 D（cruciform）；教科書亦歸為 DNA 二級結構。講義稱三級構造與官方題幹矛盾，改為二級結構。 |
| 生理學 | F022-f | fix | 專一負回饋抑制 FSH</b>（本題正解）； | 專一負回饋抑制 FSH</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（生理學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 生理學 | F035 | fix | <b>顳葉（temporal cortex，Wernicke區）</b>，屬於感覺性語言區受損 | <b>顳葉（temporal cortex，下顳葉視覺聯合皮質）</b>，屬於腹側「what」視覺路徑受損造成的視覺物體失認（visual agnosia） | 110-2-醫學一-生理學-Q48：110-2 Q48 答 C（temporal cortex），講義答案正確但解釋錯：視野正常卻說不出所見物體形狀屬視覺物體失認，病灶在下顳葉視覺聯合皮質（腹側 what 路徑），不是 Wernicke 感覺性語言區。只改解釋，保留「顳葉」答案。（兩位評分者重複回報） |
| 生理學 | F037 | note | 促進B細胞分化成漿細胞（plasma cell）； | 促進B細胞分化成漿細胞（plasma cell）<span class="hdt-intl">（⚠️ 國際教科書：B細胞分化為漿細胞主要由IL-6、IL-21（及IL-4、IL-5）驅動，IL-2對B細胞僅有輔助作用；作答以歷屆考題答案為準）</span>； | 111-1-醫學一-生理學-Q58：111-1 Q58 答 C（IL-2），講義與官方答案一致；現行免疫學教科書中驅動 B 細胞終末分化為漿細胞的主要細胞激素是 IL-6、IL-21（及 IL-4、IL-5），IL-2 主要是 T 細胞生長因子、對 B 細胞僅有輔助作用 → 保留答案、加 hdt-intl 註記。（兩位評分者重複回報） |
| 生理學 | F038 | fix | （那是溶血路徑） | （那是纖維蛋白溶解路徑） | （無考題）：plasminogen→plasmin 屬纖維蛋白溶解（fibrinolysis）路徑；「溶血」是紅血球破裂（hemolysis），用詞錯誤。cite 105/107 的考題考凝血最後一步為 thrombin 轉 fibrinogen，不受影響。其他 10 科講義未見「溶血路徑」同一誤用。 |
| 生理學 | F039 | note | <b>成分最接近大氣（吸入氣）</b> | <b>成分最接近大氣（吸入氣）</b><span class="hdt-intl">（⚠️ 國際教科書：這是吸氣末的狀態；呼氣末解剖無效腔內充滿的是肺泡氣；作答以歷屆考題答案為準）</span> | 106-1-醫學二-生理學-Q13：106-1 Q13 答 B（大氣），講義與官方答案一致；教科書上解剖無效腔的組成隨呼吸時相改變：吸氣末充滿吸入氣（已加溫加濕），呼氣末則充滿肺泡氣，講義未註明時相 → 保留答案、加 hdt-intl 註記。（兩位評分者重複回報） |
| 生理學 | F040 | fix | （左心室才與主動脈瓣相關） | （主動脈瓣逆流另一個代償是左心室離心性肥大，與右心室無關） | 106-2-醫學一-生理學-Q57：106-2 Q57 答 B（血量增加），講義結論正確；但括號「左心室才與主動脈瓣相關」語意含糊，且慢性 AR 另有左心室離心性肥大代償（Guyton 亦列血量增加與左心室肥大兩者）。補成明確敘述，與考題答案不衝突（選項 A 是右心室肥大）。 |
| 生理學 | F041 | fix | <b>唯一的例外是一氧化氮（NO）</b> | <b>最典型的例外是一氧化氮（NO）</b> | 113-2-醫學一-生理學-Q51：113-2 Q51 答 C（NO），選項中只有 NO 不存於囊泡，講義答案正確；但「唯一的例外」過度概括，CO、H2S、endocannabinoid 等同樣即時合成、不存於囊泡。改為「典型例外」，與考題答案一致。同科 hdt-teach 段有同一說法，列於 sibling-fan-06.json。 |
| 生理學 | F043 | fix | 傳遞slow pain與溫度覺（非觸壓覺）。 | 主要傳遞slow pain與溫度覺，也傳部分粗略觸覺（105年該題觸覺、壓覺選項亦一併給分）。 | 105-2-醫學二-生理學-Q6：105-2 Q6 官方答案 D（temperature），但 acceptedAnswers 為 A/C/D（pressure、touch 一併給分），講義「（非觸壓覺）」與官方給分矛盾；教科書上 C 纖維也傳部分粗略觸覺（C-tactile）。改寫為與官方給分一致的說法。 |
| 生理學 | F044 | fix | 其餘影響氧親和力的生理因子依序為溫度 | 其餘影響氧親和力的生理因子包括溫度 | 104-2-醫學二-生理學-Q9：104-2 Q9 答 D（細胞激素最不影響），只考哪個不影響；「依序為」暗示影響程度排名，教科書與考題皆無此排序，改為「包括」。 |
| 病理學 | F022-b | fix | ——這是本題正解； | ； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（病理學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 病理學 | F022-c | fix | 是致病機轉也是生物標記（本題正解）； | 是致病機轉也是生物標記； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（病理學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 病理學 | F022-d | fix | 生殖細胞腫瘤風險都上升</b>（本題正解）； | 生殖細胞腫瘤風險都上升</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（病理學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 病理學 | F022-e | fix | （與乳糜瀉相關，本題正解） | （與乳糜瀉相關） | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（病理學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 病理學 | F045 | fix | 腦梗塞的凝固性壞死、急性胰臟炎的脂肪壞死不同 | 腦梗塞的液化性壞死、急性胰臟炎的脂肪壞死不同 | 110-1-醫學二-病理學-Q76：腦梗塞屬液化性壞死（同科 necrosis-types 段與 106-1-醫學二-病理學-Q77 官方答案 A 液化性壞死皆如此）；110-1 Q76 官方答案 C 血管炎，選項 B 腦梗塞只是誘答、未指定壞死型態，故講義寫「腦梗塞的凝固性壞死」是講義自身錯誤。 |
| 病理學 | F045-sib1 | fix | 腦梗塞的凝固性壞死、急性胰臟炎的脂肪壞死混淆 | 腦梗塞的液化性壞死、急性胰臟炎的脂肪壞死混淆 | 106-1-醫學二-病理學-Q77：同一錯誤（F045 同主題 hdt-teach 段落）：腦梗塞為液化性壞死。 |
| 病理學 | F046 | fix | 此突變特徵（mutation signature）也見於紫外線、吸菸等其他致癌因子引起的癌變。 | 其特徵性突變為TP53第249號密碼子G:C→T:A顛換，可作為黃麴毒素暴露的分子指紋；TP53也是紫外線、吸菸等致癌因子常見的突變標的，但各自的突變特徵不同。 | 110-1-醫學二-病理學-Q80：官方答案 D TP53 不變；但黃麴毒素的突變特徵是 TP53 codon 249 G:C→T:A 顛換（R249S），屬其專屬分子指紋，紫外線（雙嘧啶 C→T）不同，「此突變特徵也見於紫外線」錯誤。保留 TP53 為答案，只改突變特徵敘述。（重複群組：r1-病理學-1／r2-12） |
| 病理學 | F047 | fix | （這兩者主要增加血管通透性並引起發燒） | （這兩者主要引起內皮活化與發燒等全身反應） | 105-1-醫學二-病理學-Q77：官方答案 A（血管擴張與 TNF/IL-1 為錯誤配對）與講義主旨一致；但括號內稱 TNF、IL-1「主要增加血管通透性」不正確——Robbins 通透性介質為組織胺、C3a/C5a、bradykinin、LTC4/D4/E4、PAF，TNF/IL-1 主要作用為內皮活化（黏附分子表現）與發燒等全身反應。PG 致痛一節表格已列，li 未寫錯，不改。 |
| 病理學 | F047-sib1 | fix | <td>增加血管通透性、引起發燒（非血管擴張主力）</td> | <td>內皮活化（黏附分子表現）、引起發燒（非血管擴張主力）</td> | 105-1-醫學二-病理學-Q77：同一錯誤（同科發炎介質速查表 TNF、IL-1 列）。 |
| 病理學 | F048 | fix | Cyclin A/CDK1 主要調控S期進入G2期的轉換 | Cyclin A/CDK1 主要作用於G2期至G2/M轉換（S期進行主要由Cyclin A/CDK2推動） | 106-2-醫學二-病理學-Q81：官方答案 D（Cyclin A/cdk1 被活化與 G1 停滯關係最少）不變；但 S 期進行主要由 Cyclin A/CDK2 推動，Cyclin A/CDK1 作用於 G2 晚期至 G2/M，「調控S期進入G2期」不精確。（重複群組：r1-病理學-1／r2-11） |
| 病理學 | F049 | fix | 是CNS特有的壞死型態 | 是CNS缺氧性壞死的特徵型態（細菌或黴菌造成的膿瘍亦屬液化性壞死） | 106-1-醫學二-病理學-Q77：官方答案 A 液化性壞死不變；但液化性壞死並非 CNS 特有，細菌／黴菌膿瘍亦屬之（同 li 群組下一條肺膿瘍即註為液化性壞死），「CNS特有」為過度敘述。 |
| 病理學 | F050 | fix | 周邊區型淋巴瘤（marginal zone lymphoma）則由慢性抗原刺激誘發邊緣區B淋巴細胞增生而成。 | 周邊區型淋巴瘤（marginal zone lymphoma；MALToma即其結外型）同樣由慢性抗原刺激誘發邊緣區B淋巴細胞增生而成。 | 105-2-醫學二-病理學-Q100：MALToma 即結外周邊區型淋巴瘤（115-2-醫學二-病理學-Q90 選項 A 亦明載），原句「則」使兩者讀成不同實體；改寫保留 105-2 Q100（官方答案 B marginal zone lymphoma）所需的「慢性抗原刺激」考點。 |
| 病理學 | F051 | fix | 血流供應來自腹主動脈（並非肺動脈） | 血流供應來自體循環動脈（多為胸主動脈，亦可來自腹主動脈分支；並非肺動脈） | 105-2-醫學二-病理學-Q82：官方答案 B（血流來自肺動脈為錯誤）只要求「非肺動脈」；Robbins：異常血供來自主動脈或其分支，以胸（降）主動脈最常見，寫死「腹主動脈」不精確。 |
| 病理學 | F052 | fix | 屬第三型過敏反應（免疫複體沉積） | 屬第三型（免疫複體沉積）合併第四型（延遲型，形成非乾酪性肉芽腫）過敏反應 | 105-1-醫學二-病理學-Q99：105-1-醫學二-病理學-Q99 官方答案 C 過敏性肺炎，只考診斷、未考過敏型別，無官方答案衝突；Robbins 將過敏性肺炎歸為第三型合併第四型過敏反應（同句的非乾酪性肉芽腫即第四型表現），只寫第三型不完整。 |
| 病理學 | F053 | fix | AML也是<b>成人</b>最常見的白血病類型 | AML也是<b>成人</b>最常見的急性白血病類型 | （無考題）：cite 104/106/107 的考題（104-2 Q84、106-2 Q84、107-2 Q84）均未考「成人最常見白血病」；西方教科書成人最常見白血病為 CLL，台灣則 AML 較多，無族群限定的敘述有誤導風險。改為「急性白血病」兩方皆成立。 |
| 病理學 | F054 | fix | 自體免疫胰臟炎</b>——這是本題唯一的錯誤敘述。 | 自體免疫胰臟炎</b>。 | 115-2-醫學二-病理學-Q91：官方答案 A（CFTR/PRSS1 突變）與講義一致；問題是「這是本題唯一的錯誤敘述」脫離考題語境無法理解，刪去即可。（重複群組：r1-病理學-2／r2-13） |
| 病理學 | F055 | fix | 見於約60%的切片 | 見於約三分之一（約35%）的病例 | 107-1-醫學二-病理學-Q90：107-1 Q90 官方答案 A，選項 C「病理特徵是非乾酪性肉芽腫」為正確敘述，講義保留此點；百分比未被考，Robbins 記載約 35% 病例可見，60% 偏高。（重複群組：r1-病理學-3／r2-13） |
| 病理學 | F055-sib1 | fix | 非乾酪性肉芽腫（約60%） | 非乾酪性肉芽腫（約35%） | 107-1-醫學二-病理學-Q90：同一錯誤（UC vs Crohn 比較表肉芽腫列）。 |
| 病理學 | F056 | fix | （TSC1／TSC2 是結節性硬化症；EWS–FLI1 是尤文氏肉瘤，都與膀胱無關。） | （TSC1／TSC2 以結節性硬化症聞名，並非扁平原位癌路徑的代表基因；EWS–FLI1 是尤文氏肉瘤的融合基因。） | 115-2-醫學二-病理學-Q93：官方答案 D（TP53 和 RB）不變；但 TSC1（9q34）突變／第 9 號染色體缺失見於部分膀胱泌尿上皮癌，「都與膀胱無關」為過度敘述，改成「不是扁平原位癌路徑代表基因」。 |
| 病理學 | F057 | fix | 較視網膜、脈絡膜、睫狀體之黑色素瘤慢 | 較脈絡膜、睫狀體之黑色素瘤慢（視網膜本身不含黑色素細胞，並非葡萄膜黑色素瘤的發生部位） | 111-2-醫學二-病理學-Q100：官方答案 A 虹膜不變；選項 B 視網膜只是誘答。視網膜不含黑色素細胞，葡萄膜黑色素瘤只分虹膜、睫狀體、脈絡膜，講義把視網膜列為比較對象會讓人以為有「視網膜黑色素瘤」。 |
| 病理學 | F058 | fix | （與乳糜瀉相關，本題正解） | （與乳糜瀉相關） | 115-2-醫學二-病理學-Q98：官方答案 D 與講義一致；殘留「本題正解」題解語氣，刪去。（重複群組：r1-病理學-4／r2-14） |
| 病理學 | F058-sib1 | fix | （即使沒有合併類風濕性關節炎）——這是本題正解； | （即使沒有合併類風濕性關節炎）； | （無考題）：同一問題（題解語氣「這是本題正解」殘留，Sjögren 症候群 li）。 |
| 病理學 | F058-sib2 | fix | 是致病機轉也是生物標記（本題正解）； | 是致病機轉也是生物標記； | （無考題）：同一問題（「本題正解」殘留，膜性腎病變 li）。 |
| 病理學 | F058-sib3 | fix | 睪丸的生殖細胞腫瘤風險都上升</b>（本題正解）； | 睪丸的生殖細胞腫瘤風險都上升</b>； | （無考題）：同一問題（「本題正解」殘留，睪丸腫瘤 li）。 |
| 病理學 | F060 | note | 重度異生是上皮內病變非感染，抗生素治療無效。 | 重度異生是上皮內病變非感染，抗生素治療無效。<span class="hdt-intl">（⚠️ 國際教科書：現行指引（ASCCP）HSIL 抹片多先做陰道鏡（colposcopy）切片，或直接以 LEEP 切除；作答以歷屆考題答案為準）</span> | 106-1-醫學二-病理學-Q79：官方答案 D（先做子宮頸錐狀切片）與講義一致；現行 ASCCP 指引 HSIL 抹片為先做陰道鏡切片或直接 LEEP（LEEP 本身即錐切），與講義「標準處置」措辭有出入。保留考題答案、加註國際教科書。 |
| 病理學 | F061 | fix | 呈2–3公分偏心多葉狀（eccentric and lobulated） | 常小於0.5公分（長到5公分以上稱非骨化性纖維瘤），呈偏心多葉狀（eccentric and lobulated） | 111-1-醫學二-病理學-Q79：111-1 Q79 官方答案 A fibrous cortical defect，題幹病灶約 0.3 公分；教科書 fibrous cortical defect 多約 0.5 公分，長到 5 公分以上才稱非骨化性纖維瘤，講義「2–3公分」與考題及教科書皆不符。 |
| 病理學 | F061-sib1 | fix | <td>2–3公分偏心多葉狀放射線透亮</td> | <td>偏心多葉狀放射線透亮（纖維皮質缺陷常＜0.5公分；≥5公分稱非骨化性纖維瘤）</td> | 111-1-醫學二-病理學-Q79：同一錯誤（原發性骨腫瘤速查表）。表格列同時涵蓋非骨化性纖維瘤，改寫兩者大小。 |
| 藥理學 | F062 | fix | 是唯一不透過 ACE 或 AT1 受體發揮作用的降壓藥 | 是臨床上唯一直接抑制 renin 的降壓藥，作用不經 ACE 或 AT1 受體 | 105-1-醫學二-藥理學-Q65：105-1 Q65、112-2 Q62 官方答案皆為 aliskiren（抑制 renin），與講義核心一致；但「唯一不透過 ACE 或 AT1 受體發揮作用的降壓藥」字面過度概括（CCB、利尿劑、β-blocker 都不經 ACE/AT1；連 RAAS 內的 eplerenone/spironolactone 也不經 ACE/AT1，故評分者建議的「RAAS 抑制藥中唯一」仍不精確）。改為以 renin 直接抑制為唯一性。 |
| 藥理學 | F063 | fix | 「Monday disease」指工人週末離開nitrates工作環境後產生戒斷症狀，週一重返工作後身體重新產生耐藥性、症狀隨之消失。 | 「Monday disease」指工人週末脫離nitrates而失去耐藥性，週一重返工作時出現頭痛、頭暈、心悸等症狀，數日後重新產生耐藥性、症狀隨之消失（週末脫離暴露時另可能出現戒斷性心絞痛）。 | 114-1-醫學二-藥理學-Q63：114-1 Q63 答 C（nitroprusside 易產生耐藥性為錯）；選項 D「Monday disease 消失係因對 nitrates 產生耐藥性」為正確敘述。教科書（Katzung）：週一重新暴露時（週末已失去耐藥性）出現頭痛、頭暈、心悸，週內再度耐藥後消失；週末脫離暴露的戒斷是另一現象（心絞痛／MI）。原句把週末戒斷與週一症狀消失混為一段，改寫後仍與 114 D 一致。公共衛生學講義兩處 Monday morning angina（戒斷性心絞痛）敘述正確，不需改。 |
| 藥理學 | F064 | fix | 在同類藥物中<b>最大（約7.3 L/kg）</b> | <b>高達約7.3 L/kg</b>（遠大於 lithium、theophylline、carbamazepine） | 112-1-醫學二-藥理學-Q75：112-1 Q75 答 A digoxin（血液透析效果最差），比較對象是 lithium、theophylline、carbamazepine，並非 digoxin 的同類藥；「同類藥物中最大」無依據。改為與題目選項比較，與同檔另一條 Digoxin Vd 敘述用語一致。 |
| 藥理學 | F065 | fix | 故周邊嗜中性白血球應隨之增加，「不是」減少 | 但並<b>不會減少</b>周邊嗜中性白血球（「可減少 neutrophil 數量」為錯誤敘述） | 112-2-醫學二-藥理學-Q58：112-2 Q58 為否定題，官方答案 C「可減少周邊嗜中性白血球數量」為錯誤敘述；B「刺激多種淋巴及骨髓細胞增殖」為正確敘述。官方答案只支持「不會減少」，「應隨之增加」是講義自行推論、教科書未記載 oprelvekin 會使嗜中性球增加（臨床作用主要為血小板）。改為只陳述官方可支持的部分。同檔表格「嗜中性球隨之增加，非減少」為同一錯誤，見 sibling-fan-08.json。 |
| 藥理學 | F066 | note | 可用於懷孕婦女之甲狀腺低下治療。 | 可用於懷孕婦女之甲狀腺低下治療。<span class="hdt-intl">（⚠️ 國際教科書：懷孕甲狀腺低下首選 levothyroxine，含 T3 製劑（如 liotrix）因 T3 通過胎盤少、通常不建議；作答以歷屆考題答案為準）</span> | 105-2-醫學二-藥理學-Q59：105-2 Q59 為否定題，官方答案 A（10:1 比例錯誤）；C「可以使用於懷孕婦女」在官方答案中屬正確敘述，講義與考題一致。現行教科書／ATA 指引懷孕甲狀腺低下以 levothyroxine 為首選、不建議含 T3 製劑，屬官方答案 vs 教科書，保留考題答案並加註。 |
| 藥理學 | F067 | fix | （即COX-1/COX-2抑制力最接近） | （屬非選擇性COX抑制劑，對COX-2無選擇性） | 113-1-醫學二-藥理學-Q71：113-1 Q71 答 C piroxicam（相對於 celecoxib、etodolac、meloxicam 對 COX-2 選擇性最低），講義結論正確；但括號「COX-1/COX-2 抑制力最接近」與「選擇性最低」並非同一概念（piroxicam 為非選擇性、甚至略偏 COX-1）。改括號為單一定義，不影響答案。 |
| 藥理學 | F068 | fix | 須經支氣管平滑肌特有的酯解酶 | 須經呼吸道（氣管／支氣管上皮）的酯解酶 | 113-1-醫學二-藥理學-Q67：113-1 Q67 答 B ciclesonide，題幹原文為「需經由氣管酯解酶代謝後產生活性物質」，並未說是平滑肌；教科書為呼吸道上皮細胞的 esterase 活化。「支氣管平滑肌特有」無考題支持且與教科書不符。 |
| 藥理學 | F069 | fix | 分子量最小、水溶性最大（脂溶性最小），血氣分配係數在吸入性麻醉劑中最小 | 分子量最小、脂溶性低（麻醉強度弱），血氣分配係數極低（約 0.47，與 desflurane 同屬最低一群） | 106-1-醫學二-藥理學-Q58：106-1 Q58 答 A nitrous oxide（選項無 desflurane），109-2 Q74 C「N2O 血氣分配係數比 halothane 小」為正確敘述，官方答案只支持 N2O 血氣係數低、誘導快。「水溶性最大」與血中溶解度低（血氣係數小）矛盾；「血氣分配係數在吸入性麻醉劑中最小」與教科書不符（desflurane 約 0.42 < N2O 約 0.47）。保留「誘導速度最快」以對齊 106-1 官方答案。（重複群組：r1-藥理學-3 / r2-16） |
| 藥理學 | F070 | note | 易誘發廣泛性皮膚紅疹與水疱； | 易誘發廣泛性皮膚紅疹與水疱<span class="hdt-intl">（⚠️ 國際教科書：HLA-B*5701 相關的是 abacavir 全身性過敏反應（發燒、皮疹、腸胃與呼吸道症狀），以水疱為主者較像 carbamazepine 的 SJS/TEN；作答以歷屆考題答案為準）</span>； | 110-1-醫學二-藥理學-Q51：110-1 Q51 答 C abacavir，題幹原文即為「避免藥物造成廣泛性皮膚紅疹與水疱」，講義與考題用語一致；教科書描述 HLA-B*5701 相關的是 abacavir 全身性過敏反應（發燒、皮疹、腸胃／呼吸道症狀），以水疱為特徵者較屬 carbamazepine SJS/TEN。屬官方題幹 vs 教科書，保留並加註。 |
| 藥理學 | F071 | fix | 最短 <b>triazolam</b>； | 最短 <b>triazolam</b>（常考口服安眠 BZD 中最短；靜脈用 midazolam 半衰期與之相近）； | 106-2-醫學二-藥理學-Q60：106-2 Q60 答 B triazolam，比較對象只有 alprazolam、quazepam、diazepam，未包含 midazolam；教科書 midazolam 半衰期（約 1–4 h）與 triazolam（約 2–3 h）相近。講義「最短 triazolam；短效 midazolam」暗示 triazolam 比 midazolam 短，超出官方答案的支持範圍。限縮為常考口服安眠 BZD 中最短，不影響 106-2 答案。（issue 寫的 Q59 實為 Q60） |
| 藥理學 | F072 | fix | （theophylline、caffeine、metaproterenol 是反過來用於 β促效劑過量中毒，方向相反，不能拿來解 β-blocker 中毒） | （theophylline、caffeine 為 PDE 抑制劑／adenosine 拮抗劑，metaproterenol 為 β2 促效劑，三者皆非 β-blocker 中毒的解毒首選） | 113-1-醫學二-藥理學-Q75：113-1 Q75 答 D glucagon（另 110-1 Q75 亦答 glucagon），講義核心正確；但括號說 theophylline、caffeine、metaproterenol 是「用於 β促效劑過量中毒」錯誤：metaproterenol 本身是 β2 促效劑，theophylline／caffeine 為 PDE 抑制劑／adenosine 拮抗劑，皆非任何中毒的解毒劑。改為說明三者藥理類別、非 β-blocker 中毒解毒首選。 |
| 藥理學 | F073 | fix | 造成Ca²⁺持續大量釋放且無法被粒線體回收 | 造成肌漿網Ca²⁺持續大量釋放、超過肌漿網（SERCA）回收能力 | 107-1-醫學二-藥理學-Q71：107-1 Q71、107-2 Q72 答 dantrolene，115-2 Q54 D「dantrolene 抑制骨骼肌 ryanodine receptor channel」為正確敘述，講義結論一致；但「無法被粒線體回收」不精確，細胞質 Ca²⁺ 主要由肌漿網 SERCA 回收，問題在 RyR1 持續釋放超過回收能力。不影響任何考題答案。 |
| 藥理學 | F074 | fix | 較不會引起 EPS，但有 <b>QT 延長</b>的風險。<cite>108</cite> | 較不會引起 EPS，但有 <b>QT 延長</b>的風險（108-1 此題 clozapine 亦給分）。<cite>108</cite> | 108-1-醫學二-藥理學-Q74：108-1 Q74 官方答案 A，acceptedAnswers 為 A、B（ziprasidone 與 clozapine 皆給分）；講義只寫 ziprasidone 本身無誤，但以此句出卡時 clozapine 也是官方接受的答案，補註避免卡片與官方給分不一致。 |
| 解剖學 | F022-g | fix | 內側膝狀核（MGN）</b>（本題正解）； | 內側膝狀核（MGN）</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F022-h | fix | 左第二肋間胸骨旁</b>（本題正解）； | 左第二肋間胸骨旁</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F022-i | fix | （走右側冠狀溝，本題正解） | （走右側冠狀溝） | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F022-j | fix | 故胸管在該匯入處的「前方」</b>（本題正解）； | 故胸管在該匯入處的「前方」</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F022-k | fix | 通下腔靜脈與右膈神經</b>（本題正解）； | 通下腔靜脈與右膈神經</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F022-l | fix | （renal plexus）</b>（本題正解）； | （renal plexus）</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F022-m | fix | 即為陰囊後（大陰唇後）神經</b>——本題正解； | 即為陰囊後（大陰唇後）神經</b>； | （無考題）：全科 grep「本題正解」找到的同類編寫殘留（解剖學.html），讀前後文確認是脫離考題語境的殘留字樣，只刪字樣、不動內容與 <cite>。 |
| 解剖學 | F075 | fix | 主動脈弓上下緣的分界，這幾個地標 | 主動脈弓起點與終點的高度，這幾個地標 | 114-1-醫學一-解剖學-Q17：胸骨角平面是主動脈弓起點（升主動脈移行處）與終點（移行為降主動脈）的高度，主動脈弓整體位在上縱膈，「主動脈弓上下緣的分界」語意錯。相關考題 114-1 Q17（何者錯誤，答 C 夾角 150 度；A「氣管在胸骨角水平分岔」為正確敘述）、108-2 Q23（答 C）、111-2 生理 Q17（答 B 胸骨角對應第四與第五胸椎間）皆只考胸骨角／分岔高度，無一以「主動脈弓上下緣」為答案，修正不影響任何官方答案。同段 hdt-teach 有同一錯誤，見 F075-b。（重複群組：F075＋r2-18 otherReports） |
| 解剖學 | F075-b | fix | 主動脈弓上下緣分界的高度 | 主動脈弓起點與終點的高度 | 114-1-醫學一-解剖學-Q17：F075 的同錯 sibling：同 topic 的 hdt-teach 段落也寫「主動脈弓上下緣分界的高度」，一併改為起點與終點的高度。理由與考題對照同 F075。 |
| 解剖學 | F076 | fix | 受刺激會引發咳嗽／迷走反射）。<b>CN IX | 受刺激會引發咳嗽／迷走反射）、<b>頸叢的耳大神經（great auricular nerve，C2–C3）</b>（耳廓後內側面與下半部、耳垂）。<b>CN IX | 115-2-醫學一-解剖學-Q6：句子宣稱「四條神經分區」卻只列三條（V3 耳顳、VII、X Arnold's）；第四條是頸叢的耳大神經（C2–C3，耳廓後內側面與下半部、耳垂）。115-2 Q6（外耳疼痛最不相關者，答 C 舌咽神經）與講義結論一致，補上耳大神經不改變 CN IX 為答案的結論。 |
| 解剖學 | F077 | fix | 左側第1肋間靜脈直接匯入左頭臂靜脈（不進奇靜脈系統）； | 左側第1肋間靜脈直接匯入左頭臂靜脈，第2–3肋間靜脈則匯成左上肋間靜脈後也注入左頭臂靜脈（兩者皆不進奇靜脈系統）； | 110-1-醫學一-解剖學-Q23：108-2 Q22 答 B（左側第一肋間靜脈不匯入奇靜脈系統），講義與之一致；但 110-1 Q23 為「何者錯誤」、答 C，選項 D「左上肋間靜脈不會匯入奇靜脈」被視為正確敘述，即考選部也認定左側第 2–3 肋間靜脈（經左上肋間靜脈入左頭臂靜脈）不進奇靜脈系統。原句只提第 1 肋間靜脈，易讀成僅此一條例外；補上第 2–3 肋間靜脈，與兩題官方答案皆一致。 |
| 解剖學 | F078 | fix | ；轉子吻合則額外加上上臀動脈——結紮十字吻合的血管時，上臀動脈供應區受影響最小。 | ；轉子吻合＝上臀動脈 + 下臀動脈 + 內外側迴旋股動脈（不含第一穿透動脈）——上臀動脈不屬於十字吻合，所以結紮所有十字吻合的動脈時，上臀動脈最不受影響。 | 113-1-醫學一-解剖學-Q30：113-1 Q30（結紮所有十字吻合動脈，何者最不受影響）官方答案 C 上臀動脈，講義結論正確，保留；但「轉子吻合則額外加上上臀動脈」暗示轉子吻合含第一穿透動脈，與 Moore 定義（上臀＋下臀＋內外側迴旋股動脈，不含第一穿透動脈）及同 topic hdt-teach 段落矛盾。改寫轉子吻合組成，並把結論的理由講清楚（上臀動脈不屬十字吻合）。 |

### 旁支修正（sibling）

| 檔 | 相關 issue | oldText | newText | oldText 出現次數 |
|---|---|---|---|---:|
| 生理學.html | F041 | 但一氧化氮（NO）是唯一的例外—— | 但一氧化氮（NO）是最典型的例外—— | 1 |
| 藥理學.html | F065 | （嗜中性球隨之增加，非減少） | （不會減少嗜中性球） | 1 |

### 判為誤報（keep，不改）

| 科 | issueId | 理由 |
|---|---|---|
| 公共衛生學 | F010 | 115-1 Q40 官方答案 A 梨形鞭毛蟲；講義句是與同句列出的大腸桿菌、沙門氏菌、志賀桿菌相比「效果最不理想」，且寫「梨形鞭毛蟲等會形成堅韌囊體的原蟲」，並未宣稱梨形鞭毛蟲比隱孢子蟲更抗氯，與教科書不衝突；隱孢子蟲卵囊抗氯已在寄生蟲學講義（106-1 Q80）另行涵蓋。不需加註，以免無謂排除此句。 |
| 生理學 | F036 | 105-2 Q17 答 A（視上核），題幹問「分布最接近」。Guyton 原文即寫 osmoreceptor 位於前下視丘、靠近視上核（含 OVLT），且視上核大細胞神經元本身也具滲透感受性；講義「分布最接近視上核」與教科書並不矛盾，不需加註。cite 105 另指 105-2 Q3（答 A 視前核），該半句正確。誤報。 |
| 生理學 | F042 | 110-1 Q48 答 D（osmolarity 高於 300 mOsmol/L）。評分者的反例（尿素溶液 osmolarity >300 卻不高張）是反方向命題；講義寫的是「高張 → osmolarity 必 >300」：高張代表不能穿膜的溶質就已超過約 300 mOsmol/L，總 osmolarity 只會更高，因此「必」在此方向成立。同 li 前一條已講清 osmolarity 與 tonicity 的分野。誤報。 |
| 病理學 | F059 | 官方答案 A cyclin D1，講義一致。Robbins 記載 cyclin D1 過度表現約見於 40% 腺瘤（PRAD1 倒位約 10–20%），MEN1 體細胞突變約 20–30%，「最常見分子缺陷為 cyclin D1 過度表現」與教科書並不衝突，不需 hdt-intl 註記。 |

## 各階段失敗或被略過的項目

### 選句／挑字（select、pick）

- 9 科 draft 475 個，status≠ok：0 個。
- `agent-pick-fan/`：prompt 475、reply 475，缺 reply 0 個。
- 0 候選句考點（規則層沒有送 LLM 的句子）：0 個。

### 沒有任何卡的考點（86 個）

| 科 | 數量 | 考點 leafId |
|---|---:|---|
| 組織學 | 3 | epithelial-tissue-classification-and-lining、cartilage-histology、urinary-system-histology |
| 公共衛生學 | 7 | confidence-interval-hypothesis-testing、screening-test-validity、climate-change-and-greenhouse-gases、pneumoconiosis-and-dust-hazards、medical-ethics-informed-consent、substance-abuse-and-harm-reduction、social-determinants-of-health |
| 微生物學 | 8 | strep-pyogenes-groupA、listeria-monocytogenes、salmonella-and-shigella、campylobacter-helicobacter、legionella-pneumophila、chlamydia-trachomatis、coronaviridae、viral-gastroenteritis-rotavirus-norovirus |
| 生物化學 | 14 | hemoglobin-myoglobin-oxygen-binding、gluconeogenesis-pathway-regulation、cancer-metabolism-warburg-effect、tca-cycle-enzymes-intermediates、urea-cycle-ammonia-transport、transcription-rna-polymerase-mechanism、genetic-code-wobble-hypothesis、ubiquitin-proteasome-degradation、molecular-analysis-techniques、reverse-transcriptase-retroviral-biology、gpcr-structure-signaling、gpcr-camp-pka-signaling、guanylyl-cyclase-cgmp-signaling、pi3k-akt-signaling |
| 生理學 | 13 | proprioception-and-spinal-reflexes、motor-control-hierarchy-and-motor-neuron-disorders、vision-retina-and-phototransduction、muscle-fiber-types-and-fatigue、blood-groups-and-transfusion-reactions、chemoreceptor-control-and-altitude-exercise-adaptation、obstructive-and-restrictive-lung-disease-physiology、renal-acid-base-regulation、hypothalamic-pituitary-axis-overview、insulin-secretion-action-and-energy-metabolism、cortisol-actions-cushing-syndrome-and-circadian-regulation、adrenal-cortex-steroidogenesis、stress-response-and-catecholamine-hormones |
| 病理學 | 2 | chromosomal-numerical-disorders、diabetes-mellitus-pathology |
| 藥理學 | 5 | pulmonary-hypertension-drugs、gout-drugs、opioid-analgesics、alzheimer-disease-drugs、targeted-anticancer-mab-tki |
| 解剖學 | 34 | cerebral-cortex-functional-localization、limbic-system-and-hippocampal-formation、cerebellar-peduncles-afferent-efferent、internal-capsule-vascular-supply、cranial-nerve-parasympathetic-nuclei、pupillary-light-reflex-and-accommodation、cerebral-arterial-territories、brainstem-vascular-syndromes、trigeminal-nerve-branches-and-distribution、facial-nerve-branches-and-parasympathetic、salivary-glands、glossopharyngeal-nerve-distribution、nasal-cavity-and-paranasal-sinuses、neck-triangles-and-cervical-fascia、neck-vasculature-jugular-veins、lymphatic-drainage-thorax-and-breast、mesenteric-vasculature-and-gi-blood-supply、abdominal-aorta-branches、inferior-vena-cava-and-tributaries、abdominal-autonomic-innervation、adrenal-gland-and-suprarenal-vessels、male-reproductive-organs-and-prostate、bladder-anatomy-and-innervation、penile-and-clitoral-erectile-anatomy、pelvic-vasculature-internal-iliac-branches、pelvic-splanchnic-and-autonomic-innervation-of-pelvis、musculocutaneous-nerve、forearm-muscles-and-nerve-supply、humerus-and-elbow-region、lumbar-plexus-branches、gluteal-region-nerves-and-muscles、knee-joint-ligaments-and-menisci、leg-vasculature-and-nerves、back-muscles-erector-spinae-and-suboccipital-region |

### admit 剔除的片段（`admit-log.json`）

| 科 | cap | filter | gate | hide | pick | 合計 |
|---|---:|---:|---:|---:|---:|---:|
| 組織學 | 1 | 2 | 8 | 2 | 2 | 15 |
| 免疫學 | 3 | 1 | 5 | 7 | 0 | 16 |
| 公共衛生學 | 0 | 5 | 9 | 0 | 2 | 16 |
| 微生物學 | 3 | 5 | 11 | 8 | 0 | 27 |
| 生物化學 | 6 | 4 | 29 | 20 | 5 | 64 |
| 生理學 | 0 | 1 | 11 | 1 | 3 | 16 |
| 病理學 | 13 | 9 | 13 | 7 | 4 | 46 |
| 藥理學 | 27 | 3 | 38 | 18 | 0 | 86 |
| 解剖學 | 0 | 1 | 20 | 3 | 1 | 25 |

`hide` 是只丟掉一個 hide 片語、卡仍保留；其餘是片段被丟。

### 洩題審查（`audit-fan/`）

- packet 23、reply 23，缺 reply 0 個。判決：drop 230、hide 172、ok 710。

### 評分格式檢查（`grade/check.py`）

- 41 個 packet，未通過：0。

### 講義修正套用前要處理

無：每筆 fix／note 的 oldText 都在講義中恰好出現一次。

### admit 標出的數值矛盾（`admitted.json` contradictions）

- 8 組（生理學「再吸收」7 處、病理學「20%」3 處、病理學「何杰金氏淋巴瘤」2 處、病理學「最常見」18 處、病理學「最常見的原因」2 處、病理學「潰瘍性結腸炎」3 處、病理學「肺栓塞」3 處、藥理學「拮抗劑」2 處）；跨考點重複 0 組。這些是同主詞、不同數值的句子，需人工確認是否真的矛盾（例如不同腎小管段的再吸收比例並不衝突）。

