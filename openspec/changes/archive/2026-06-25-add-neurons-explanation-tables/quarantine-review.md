# Severe-quarantine triage — owner review

> 83 severe-quarantine 詳解 全部 triage 完。本檔列出**需要你看**的項目。pipeline/腳本見 handoff。

## 摘要

| 類別 | 數 | 動作 |
|---|---|---|
| ✅ no-table（確認無表，flat text 正確） | 25 | 無需動作 |
| ✅ recovered + 已 apply（零內容遺失） | 13 | 已上線 |
| 🟢 Bucket A — 已重建、只掉 OCR 碎屑（≤5 token） | 11 | 你點頭即可 batch apply |
| 🟡 Bucket B — 已重建、但掉了真內容（figure/prose block） | 7 | 你看掉的內容要不要緊 |
| 🔴 Bucket C — needs-human（沒表可建、要醫學判斷對齊） | 27 | 高工、低良率；逐題判斷 |

---

## 🟢 Bucket A — quick-verify (11)
agent 已重建出真表格，gate 只攔在掉了 ≤5 個非 footer token，逐一看多是 OCR 拆字/typo/citation 碎屑。**你說 OK 我就 batch apply。**

| id | 掉的 token（content-absent） |
|---|---|
| `104-1-醫學二-生理學-Q23` | 4：lipolipaseketongenesis輛GLUT |
| `104-2-醫學一-公共衛生學-Q86` | 3：討探結 |
| `104-2-醫學一-微生物暨免疫學-Q48` | 4：册謝代唯 |
| `107-1-醫學二-病理學-Q90` | 1：Imflamatory |
| `107-2-醫學一-解剖學-Q1` | 1：醜 |
| `107-2-醫學二-微生物暨免疫學-Q24` | 1：梅 |
| `108-1-醫學二-病理學-Q81` | 3：8B9E9B |
| `110-2-醫學一-胚胎學-Q34` | 5：筆胎統乙記 |
| `113-2-醫學二-微生物暨免疫學-Q19` | 2：WalportComplement |
| `114-2-醫學一-生物化學-Q82` | 1：endonucleas |
| `114-2-醫學二-微生物暨免疫學-Q28` | 3：互寄蟲 |

## 🟡 Bucket B — recovered 但掉真內容 (7)
agent 抽出了主表，但**丟掉一塊真內容**（多為 figure-OCR / 英文 textbook prose / 第二張子表）。你判斷掉的那塊要不要緊：不要緊→apply 主表；要緊→留 flat 或進 Bucket C 重做。

| id | 掉了幾個 content token | 掉的內容（前 24） |
|---|---|---|
| `104-2-醫學一-解剖學-Q22` | 105 | Snal問deepviewghwnwvlemsuur很Posor清IstesarTibtalbevs能楚digitorummiddle人hallucis就SwpeoniclngnsmdermsmciLrPosterior中soleamlwwboingnm正HesorInnervationbresleTeansvtise好anwyjusffootaliovelegaBaensorfibular肥wphencuenhalucisfeworhalhicisdlgitanumnAnteekorMedhallenguismfnscsectionantetiorFibularisttealIremrtecimentramePostscompartmentNETTERIMAGESihwdierniongusExtensoraperfciafntscdesoral饒waiuanAnteriorCrossnhaliposprormitalnfeedigtenmnTibialisCHER了隻outaneosnuternCommonnervsperoneusFaularaSuperficialLateral應對bongskoegnsDeepanwtFRnlarsFibufariecreasseitumbonsse嚎Fibulanis該iaphenouswperonealsnenDeepusiELSEVIERFouleeisnerveofleg |
| `110-1-醫學一-生物化學-Q76` | 99 | 問偶近者很20Lecture成公報忘先才動須指放但元案知啥肪象中猜定cycle濃母表改且筆courses話好初樣purdue這都酬爛棄輯完利難容答道投脂把決還法常度真印它廢書找邏超了寫覺謝代錯Spring算如等版易粗裡置雖種然實始ures點記故必習吧理最光推chem |
| `109-2-醫學二-藥理學-Q69` | 62 | pharmacology王releaseCemetidineBRAF2649Diphen湘clinical份MeclinePresynapticaminevariousmodulating義antihistaminespatients翻transmitters講譯appearsMcGrawBasicimportantagonists帶playbrain塞system開給LangerolesperipheralPromeMedical波翠訣你areaspitolisantreceptors是nerves老reduce概Katzungseveral理蜜drowsinesswithnervousacetylcholineinvestigational說peptideYork |
| `104-2-醫學一-微生物暨免疫學-Q63` | 62 | AAFTFALPNPTHYMUStogetherprogenitorJregionhairpinlargeBONEPKcshairpinsIL2RGgeneratingeffectorformmatureRSSsgeneratesArtemisRAGIPairingexonucleasenucleotidesynthesisstrandsIymphoidcaresmallpalindromicUnpairedLNTMTmemomfilledcell0D5DbroughtMARROWimmaturegapsCD3EtransitionalplasmajointopensligationBLOOD2nAnremovednaivestemPrePmemory1aCD3GadditionsendsCoroninDKF9A9TcodingnucleotidesCD3zAPEI |
| `104-2-醫學二-生物化學-Q32` | 26 | 題負APRT已忘共能Acid子人ribose偉千Adenine顺附phosphoribosyItransferasePRPPGuanosineFPRPPUrateIymphocyte責同宏宋 |
| `112-2-醫學一-組織學-Q40` | 12 | 名特Astro症型cytes稱臨病態徵床 |
| `106-2-醫學二-寄生蟲學-Q32` | 6 | dazoleMetroniAmphoTrophozoitetericin |

## 🔴 Bucket C — needs-human (27)
表格**確實存在**但 cell 順序被 OCR 打散到需要醫學判斷才能對齊（給錯就是給錯醫學事實）。agent 拒絕猜測。每題附 ambiguity note：

### `104-2-醫學一-公共衛生學-Q90`
PSI 空氣污染指標 numeric matrix (5 pollutants × 6 PSI bands) + health-effect rows. Numbers (50/140/300/600...) streamed without preserving pollutant/band cell, 35 numbers for 30 cells with stray '-.'; bottom health-effect descriptions split mid-character across columns. Owner must decide which number maps to which pollutant×band and reassemble the per-band health-effect prose.

### `104-2-醫學一-微生物暨免疫學-Q64`
CD4 T-cell differentiation table (Th17/Th1/Th2/Treg/TFH × 刺激分化環境因子 / 分泌物質). Cytokine tokens (IL-6/IL-12/TGF-beta/IL-4/IFN-gamma/IL-21/IL-5/IL-2/ICOS/IL-10/IL-17/IL-13) are interleaved and do NOT preserve which cytokine belongs to which subset×row; ICOS (a surface marker) placement also unclear. Assigning each scattered cytokine to a column requires supplying canonical immunology = guessing. Owner must re-pair cytokines to the 5 subsets.

### `104-2-醫學一-微生物暨免疫學-Q71`
HLA-autoimmune table (HLA allele/Disease/Relative risk/Sex ratio ♀:♂), ~11 diseases. Disease+allele cells mostly readable, but Relative-risk and Sex-ratio NUMBERS are scrambled across rows: Myasthenia gravis has ~1/2.5 then stray 10-20/5.8 float before SLE (which has no attached numbers); RA has only one number (4.2, missing sex-ratio); Graves'/Hashimoto's both show floating '4-5'. Per-row RR vs sex-ratio assignment needs the canonical Janeway values = guessing. Owner must place the floating numbers into the correct disease rows.

### `104-2-醫學一-組織學-Q37`
Multiple embedded tables. The 中間絲體 4-tissue table (結締vimentin/肌肉desmin/上皮keratin/神經Neurofilament+GFAP) IS cleanly recoverable, BUT the central GI-neuroendocrine cell→hormone table (S/G/I/D/D1/K/Mo/EC/EC-like cell vs Secretin/Gastrin/CCK-PZ/Somatostatin/VIP/GIP/Motilin/5-HT/Histamin/Substance P) is interleaved as two offset columns — re-pairing each cell to its hormone needs canonical histology; the 分泌形式 (Holocrine/Apocrine/Merocrine) mini-table is also garbled. Owner must re-pair the GI cell↔hormone columns (中間絲體 table can be salvaged).

### `104-2-醫學一-解剖學-Q19`
Lumbosacral plexus nerve table (節段/神經/感覺/運動). The 腰神經叢 portion (ilioinguinal/genitofemoral/femoral, 3 rows) is reconstructable, BUT the 薦神經叢 pudendal-nerve sub-structure is genuinely nested/scrambled: 陰部神經→會陰神經(會陰淺隙/深隙 branches), 後陰囊(大陰唇)神經, 背陰莖(陰蒂)神經, 下直腸神經 — the sensory vs motor cells interleave across the 淺隙/深隙 sub-branches (e.g. line mixing 尿道外括約肌/深橫會陰肌 motor with 外生殖器/陰道下部 sensory). Owner must decide which sensory/motor + 淺隙/深隙 branch pairs with each pudendal sub-nerve.

### `104-2-醫學一-解剖學-Q4`
兩個腦神經表（I–XII）：①各腦神經大致功能表（功能/感覺/運動子列被 OCR 拆散、器官清單跨多行斷裂、感覺與運動標籤錯位），②腦神經臨床症狀表（症狀與神經名/羅馬數字交錯，顏面神經 VII 與聽神經 VII 段落最亂、『對側眼睛下方肌肉癱瘓』歸屬不明）；外加眼球解剖圖 OCR 亂碼。症狀雖可憑醫學常識歸位，但功能表跨行子列拆解需逐列判斷，row 邊界靠猜。owner 需決定功能表每列感覺/運動清單的切分。

### `104-2-醫學二-生物化學-Q48`
「G protein 2 種訊息傳遞路徑」確為表格（欄：相關 G protein｜Effector｜2nd messenger｜Protein kinase），但 OCR 把欄標題與三列值（Gs/Gi/Gq）打散，且 Gi 列文字僅剩 cAMP（↓），缺 effector 與 kinase 兩格 → 補齊需新增事實。owner 需決定 Gi 列的 effector/kinase 欄是否填入（恐逾『不新增事實』）。

### `104-2-醫學二-生理學-Q12`
兩個心動週期表：①瓣膜表（欄：階段｜Semilunar Valves｜AV Valves｜心房/心室狀態），閉/開狀態與階段名 OCR 錯位、描述欄跨 4–6 行使 row 邊界不明；②基本術語表（波形｜詮釋），QRS 的描述『左右心室快速去極化…對應至選項D』出現在標籤之前、各列詮釋前後拆散。兩表的瓣膜閉/開對位與描述切分需逐列醫學判斷，無法不猜地還原。

### `104-2-醫學二-生理學-Q7`
3 個比較表(骨骼肌/心肌/平滑肌 結構+功能、Type I/IIA/IIB 肌纖維分類)。表頭與儲存格垂直拆散、跨欄/跨列嚴重交錯、數值與列名脫鉤(如靜止膜電位 -90/-80/-50mV、絕對不反應期 4/50/200msec 與肌肉種類對應已錯位)。原作者亦註明此表可略。需醫學判斷才能對齊三類肌肉×十餘屬性的每一格，無法在不猜測下忠實重建。

### `104-2-醫學二-生理學-Q8`
含 Ig 分類表(IgG/IgA/IgM/IgD/IgE × 聚合體/抗原結合量/分子量/重鏈/%/胎盤/補體/Fc/功能)，與血基質-膽紅素代謝循環圖 OCR 雜訊交織；Ig 表的欄(5 種抗體)與列(屬性)順序錯亂且部分值重複/錯位(如分子量 180/385/900/200/150 無法可靠對到對應抗體)。需免疫學判斷對齊，無法忠實重建。

### `104-2-醫學二-藥理學-Q60`
生長相關藥物表(藥名/作用/適應症，含 促進/抑制生長 群組標籤)。GH 回饋路徑示意圖 OCR 與藥名(Sermorelin/Somatropin/Somatrem/Mecasermin/Octreotide/Pegvisomant)及其作用、適應症儲存格交錯錯位，群組標籤(促/抑)被拆散嵌入列中。需藥理判斷對齊藥名↔機轉↔適應症，無法忠實重建。

### `104-2-醫學二-藥理學-Q61`
性腺荷爾蒙多張藥物表(estrogen/progesterone/androgen 之 致效/抑制 各藥名/機轉/適應症，含 SERM 與不同組織致效或抑制的註解)。儲存格與群組標籤嚴重交錯、跨列拆散，藥名↔機轉↔適應症對應已亂。需藥理判斷對齊，無法忠實重建。

### `104-2-醫學二-藥理學-Q62`
抗心律不整藥物分類表(通道阻斷劑 I-IV/藥物/心電圖變化/對心肌影響，含 Ia AP↑QT↑、Ib AP↓ 等)。儲存格垂直拆散、class 群組與藥名/心電圖變化欄交錯錯位。需藥理判斷對齊 class↔藥名↔ECG 變化，無法忠實重建。

### `104-2-醫學二-藥理學-Q63`
與 Q62 同型的抗心律不整 class 表(通道阻斷器/藥物/心電圖變化/對心肌影響)，OCR 後 class 標籤、藥名、AP/QT/PR 變化欄交錯錯位、跨列拆散。需藥理判斷對齊，無法忠實重建。

### `104-2-醫學二-藥理學-Q65`
自律神經系統多張表(交感/副交感 之節前後神經傳導物質與受器、cholinergic receptors、以及 TABLE 6-3 各器官交感/副交感作用與受器)。圖文 OCR 嚴重交錯，器官×(交感作用/受器/副交感作用/受器)的每一格錯位且部分英文表頭斷裂。需 ANS 藥理/生理判斷對齊整張器官效應表，無法忠實重建。

### `106-1-醫學一-公共衛生學-Q91`
含 3 表：①新舊輻射單位換算表、②射質因數 Q 表 皆可乾淨重建；但核心的『組織加權因數(WT)』表為 器官 × ICRP-26 × ICRP-60 三欄，多列只有單一數值(如 結腸 0.12、胃 0.12、膀胱 0.05、肝臟/食道 0.05、皮膚 0.01 等)，OCR 已遺失該值落在 ICRP-26 或 ICRP-60 欄的位置資訊。需 ICRP-26 vs ICRP-60 之輻防知識判斷單值欄位歸屬，無法在不引入外部事實/猜測下忠實重建整表。請 owner 決定各單值列歸 ICRP-26 或 ICRP-60。

### `106-2-醫學二-病理學-Q82`
Hypercoagulable state classification table fully flattened into a single bullet stream — sub-column headers (原發性: 常見/少見/極少見; 續發性: 血栓高危險群/血栓低危險群) emitted before a flat item list with ZERO column-position signal. Owner must decide each item's column: which of the 7 inherited factors (Factor V/prothrombin/MTHFR/ATIII/Protein C/Protein S/fibrinolysis defect) is 常見 vs 少見 vs 極少見, and where the 高/低危險群 boundary falls among the 14 acquired risk factors. Reconstruction requires Robbins-knowledge guessing of original boundaries.

### `108-2-醫學二-病理學-Q80`
副腫瘤症候群 vs 癌症對照表：欄位約為「副腫瘤症候群 | 對應肺癌分類 | 其他癌症」，但 cell 嚴重交錯且多空格/破折號。庫欣氏症→小細胞、SIADH、高血鈣(PTH)、多發性神經病變、非細菌性血栓性心內膜炎、黑色棘皮病、胸腺瘤等列的「肺癌分類」與「其他癌症」cell 對不上（腎細胞癌/EPO、胰臟癌/胃癌、胰臟癌/前列腺癌、消化道癌症/乳癌等需 owner 判定哪個癌配哪個症候群）。需醫學判斷才能 faithfully 配對。

### `108-2-醫學二-病理學-Q93`
腎病症候群(Nephrotic) vs 腎炎症候群(Nephritic) 對照表（列：診斷要件/病理/疾病）＋免疫複合體沉積位置分類（上皮下/subendothelial/mesangium）。cell 嚴重破碎錯位：各疾病(MCD/DN/FSGS/PSGN/Goodpasture/Alport/薄基底膜/SLE/MPGN/IgA/HSP/Wegener)未標明歸 nephrotic 或 nephritic；沉積位置段落 OCR 破碎(「-S 烯」「孢」「class II」)。需醫學判斷分類，無法 faithfully 重建。

### `108-2-醫學二-藥理學-Q55`
氣喘藥物兩張表（長期控制：分類|藥名|用途；支氣管擴張劑：分類|藥名|用途）。表格確實存在但多 cell 缺失/破碎：吸入型類固醇(Budesonide)的分類欄與用途欄空白、Leukotriene modifier 列「Zileuton - st 字根 的氣喘」破碎、Anti-cholinergic/theophylline 列用途不全。需醫學判斷補回欄位才能 faithfully 重建。

### `108-2-醫學二-藥理學-Q59`
抗結核藥物表（藥名 | 機制 | 特殊註記/副作用），列以 INH/ETB/RIF/PZA/SM 為錨。但 cell 嚴重交錯且 OCR 破壞（大量「酶」取代字、空 cell；PZA 列藥名缺失只剩機制片段；RIF 列機制/副作用分欄錯亂）。機制欄與副作用欄無法 faithfully 切分，需醫學判斷。

### `108-2-醫學二-藥理學-Q63`
長期使用類固醇副作用表，欄位約為「作用機制/促進分解 | 器官系統 | 副作用」。但 cell 交錯：器官(皮膚/肌肉/軟組織/發育/內分泌/骨頭/免疫/心血管)與機制(降低osteoblast活性/抑制Phospholipase A2活性/α1受器)及症狀混雜，機制 cell 與器官/症狀對不齊（如降低osteoblast活性、抑制PLA2活性插在骨頭/免疫列間）。需醫學判斷對齊欄位。

### `110-2-醫學二-微生物暨免疫學-Q12`
HHV 家族傳染/潛伏矩陣（6 病毒欄：HSV(HHV1,2)/VZV(HHV3)/EBV(HHV4)/CMV(HHV5)/HHV6,7/HHV8）。傳染列(Close contact/Sexual/唾腺/飛沫)的 O/空白 對位明確可復原，但「潛伏位置」列有 9 個值(神經細胞/神經細胞/記憶B細胞/淋巴球/單核球/骨髓細胞/T細胞/單核球/B細胞)需塞進 6 欄，部分病毒(CMV、HHV6/7、HHV8)有多個潛伏部位，9→6 的分配需醫學判斷，無法 faithfully 完成整表。

### `111-1-醫學二-微生物暨免疫學-Q7`
鏈球菌比較表（表頭 6 欄：細菌名|溶血|出現位置|夾饃|毒力|會不會被抑制）。但各列 cell 數不一致：A化膿列「β 全溶」疑似溶血欄被拆成兩值(8 token>6 欄)；牛列與肺炎雙球列缺溶血/出現位置 cell；夾饃欄同時混入莢膜材質(玻尿酸/多醣)與字面「夾饃」；毒力欄時有時無。欄位對齊需醫學判斷，無法 faithfully 重建。

### `112-1-醫學二-藥理學-Q73`
兩個表格皆有對齊歧義。(1) 抗癲癇藥物表頭三群（阻斷通道Na/Ca/K、加強GABA、阻斷受器NMDA/AMPA）但子標題僅列 5 欄（Na/Ca/K/NMDA/AMPA），『加強GABA』欄無對應子標題，且各藥的 ✓ 位置只能靠 OCR 折疊後的空白行數推斷，無法確定每個 ✓ 落在哪一欄（需逐藥判斷阻斷對象）。(2) 減重藥物表（減重藥物/機制/如何減重/使用注意事項/台灣使用現況）儲存格嚴重換行折疊、空白格未標記，諾美婷(Sibutramine)一列機制與欄位錯位。Owner 須依藥理事實逐藥指定每個 ✓ 對應欄位、並判定減重表各列空白格與換行歸屬。題目答案(topiramate→AMPA)已於 (A)(B)(C)(D) 散文給出，表格僅為補充。

### `112-2-醫學一-胚胎學-Q34`
兩個生殖器同源對應表。表1（痕跡器官 男/女 起源：排出小管 from 中腎管 / from 體腔上皮 / 中腎管 / 副中腎管）列-群標籤(頭端/尾端)與男女兩欄嚴重交錯，OCR 順序未保留原始同列配對，須以胚胎學判斷哪個男性構造與哪個女性構造同列(如 Appendix epididymis↔Epoophoron、Epididymis↔Paroophoron)；表2（泌尿生殖竇/生殖結節/泌尿生殖摺/陰唇陰囊摺/導引帶 同源）較乾淨但與表1 混在同一補充區。Owner 須確認表1 各列男↔女同源配對。題目答案(儲精囊 from 中腎管)已於開頭散文(中腎管：…儲精囊…)給出。

### `114-2-醫學一-組織學-Q38`
三種肌肉比較表（骨骼肌/心肌/平滑肌）多列乾淨，但數列無法 1:1 對 3 欄：『疲勞』列僅有 2 值(最快/不會疲勞)，平滑肌欄缺值；『受到牽扯時是否會反射收縮』為跨欄合併格(『單一單位平滑肌…會反射收縮』橫跨心+平)；表底『有/無』孤兒格(115-116、122-123 行)歸屬不明，與『特有』『加成與強直』列交錯。Owner 須判定疲勞列平滑肌值、受牽扯反射列各欄歸屬、及底部有/無孤兒列屬於哪個屬性。三聯體機制散文與大部分列可還原，但因上述列無法忠實填滿故整題標 needs-human。
