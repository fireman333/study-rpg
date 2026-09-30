# 講義挖空字卡試點（一階 neurons）— owner 審核表

> 每張卡都已通過 build 閘門（逐字、唯一、形狀白名單），但**醫學正確性沒有任何自動檢查**。
> 「agent 預評」欄是 agent 的預先判讀（`pilot-grades.json` 的 `grader: "agent-pregrade"`），**不是**你的評分，也不能用來 promote。
> 請在「owner」欄填：好 / 普通 / 不好 / 醫學錯誤。發布門檻：好 ≥70%、不好 ≤10%、醫學錯誤 0（分母＝下表全部卡）；考點覆蓋率分母 33。
> 卡面中【＿＿＿】是答案、【…】是一併遮住的括號註解或洩題片語（hint）；句末數字是 `<cite>` 出題年份，不屬於卡。

預評合計：236 張｜好 126（53%）｜普通 58｜不好 52（22%，其中醫學錯誤 12）

考點覆蓋：27/33

## packages/content-neurons-tw/src/handout/胚胎學.html

24 張｜有卡考點 10/12

### 配子形成與受精（Gametogenesis and Fertilization）（low-yield）

#### `gametogenesis-fertilization#k4`
- 卡面：【＿＿＿】（【…】）在月經週期中會出現兩次高峰：排卵前由優勢濾泡（dominant follicle）分泌，誘發黃體成長激素（LH）激增以觸發排卵；排卵後則由黃體（corpus luteum）分泌第二個高峰，藉此維持子宮內膜增厚。115
- 答案：**動情素**　（一併遮住：estrogen）
- 原句：動情素（estrogen）在月經週期中會出現兩次高峰：排卵前由優勢濾泡（dominant follicle）分泌，誘發黃體成長激素（LH）激增以觸發排卵；排卵後則由黃體（corpus luteum）分泌第二個高峰，藉此維持子宮內膜增厚。115
- agent 預評：好 — 115-1 Q32 正答 C 動情素雙峰，卡答案即考點，括號英文已遮。
- owner：

### 三胚層形成與原腸胚形成（Germ Layers and Gastrulation）（穩定考點）

#### `germ-layers-gastrulation#k8`
- 卡面：三胚層各自的主要衍生物詳見下方對照表；皮脂腺、汗腺、頭髮都屬於體表外胚層衍生物，但【＿＿＿】（【…】）是由真皮層的間葉組織分化而成，屬於中胚層衍生物，是這個題型最容易搞混的一組。113/115
- 答案：**豎毛肌**　（一併遮住：arrector pili muscle，附著於毛囊的平滑肌）
- 原句：三胚層各自的主要衍生物詳見下方對照表；皮脂腺、汗腺、頭髮都屬於體表外胚層衍生物，但豎毛肌（arrector pili muscle，附著於毛囊的平滑肌）是由真皮層的間葉組織分化而成，屬於中胚層衍生物，是這個題型最容易搞混的一組。113/115
- agent 預評：好 — 115-1 Q35 給分 D 豎毛肌（非外胚層），與卡一致且答案唯一。
- owner：

#### `germ-layers-gastrulation#k9`
- 卡面：軸旁中胚層（paraxial mesoderm）約在第 20–21 天分化形成【＿＿＿】（【…】），日後衍生出骨骼、骨骼肌與真皮結締組織；脊索、體腔、原條都不是軸旁中胚層的衍生物。106/111
- 答案：**體節**　（一併遮住：somite）
- 原句：軸旁中胚層（paraxial mesoderm）約在第 20–21 天分化形成體節（somite），日後衍生出骨骼、骨骼肌與真皮結締組織；脊索、體腔、原條都不是軸旁中胚層的衍生物。106/111
- agent 預評：好 — 111-1 Q32 正答 B 體節，卡答案即考點。
- owner：

#### `germ-layers-gastrulation#k10`
- 卡面：脊索形成後，其正上方的外胚層分化為神經外胚層：先形成扁平的神經板（neural plate），中央凹陷成【＿＿＿】（【…】），兩側隆起的神經摺（neural fold）向中線靠攏融合，最終形成封閉管狀的神經管（neural tube），日後發育為中樞神經系統；周邊神經系統則是由神經嵴（neural crest）發育而來，不是神經管。106/113
- 答案：**神經溝**　（一併遮住：neural groove，約第 18 天）
- 原句：脊索形成後，其正上方的外胚層分化為神經外胚層：先形成扁平的神經板（neural plate），中央凹陷成神經溝（neural groove，約第 18 天），兩側隆起的神經摺（neural fold）向中線靠攏融合，最終形成封閉管狀的神經管（neural tube），日後發育為中樞神經系統；周邊神經系統則是由神經嵴（neural crest）發育而來，不是神經管。106/113
- agent 預評：—
- owner：

### 咽弓、咽囊與咽溝發育（含耳、顏面）（Pharyngeal Arches, Pouches, and Grooves）（常青必掃）

#### `pharyngeal-arches#k13`
- 卡面：第四及第六咽弓皆由CN X（迷走神經；第四走上喉神經、第六走喉返神經）支配，衍生環甲肌、腭帆提肌、咽縮肌、喉內在肌、食道骨骼肌；軟骨衍生甲狀軟骨、環狀軟骨、杓狀軟骨、小角軟骨、楔形軟骨——唯獨不含會厭軟骨（會厭軟骨由【＿＿＿】【…】 【…】形成）。105/109/112
- 答案：**咽下隆起**　（洩題片語遮住：hypopharyngeal；eminence）
- 原句：第四及第六咽弓皆由CN X（迷走神經；第四走上喉神經、第六走喉返神經）支配，衍生環甲肌、腭帆提肌、咽縮肌、喉內在肌、食道骨骼肌；軟骨衍生甲狀軟骨、環狀軟骨、杓狀軟骨、小角軟骨、楔形軟骨——唯獨不含會厭軟骨（會厭軟骨由咽下隆起hypopharyngeal eminence形成）。105/109/112
- agent 預評：—
- owner：

#### `pharyngeal-arches#k14`
- 卡面：舌頭發育分前後兩部分：前2/3（body of tongue）由第一咽弓的中央舌芽（median tongue bud）與左右兩個遠端舌芽（distal tongue bud）融合而成；後1/3（咽喉部pharyngeal part）由第二咽弓形成的聯合部（copula）與第三、四咽弓形成的【＿＿＿】（【…】）共同構成，但聯合部會被【…】；前2/3與後1/3則以terminal sulcus為界。112/114
- 答案：**咽下隆起**　（一併遮住：hypopharyngeal eminence）　（洩題片語遮住：逐漸長大的咽下隆起擠壓而消失）
- 原句：舌頭發育分前後兩部分：前2/3（body of tongue）由第一咽弓的中央舌芽（median tongue bud）與左右兩個遠端舌芽（distal tongue bud）融合而成；後1/3（咽喉部pharyngeal part）由第二咽弓形成的聯合部（copula）與第三、四咽弓形成的咽下隆起（hypopharyngeal eminence）共同構成，但聯合部會被逐漸長大的咽下隆起擠壓而消失；前2/3與後1/3則以terminal sulcus為界。112/114
- agent 預評：—
- owner：

#### `pharyngeal-arches#k11`
- 卡面：咽溝（咽裂）僅第一咽溝持續存在，衍生形成外聽道（external acoustic meatus）；第二至第四咽溝在正常發育中會退化，其殘留的【＿＿＿】（【…】）若閉鎖不全，會形成鰓竇／鰓囊腫等異常。104/109
- 答案：**頸竇**　（一併遮住：cervical sinus of His）
- 原句：咽溝（咽裂）僅第一咽溝持續存在，衍生形成外聽道（external acoustic meatus）；第二至第四咽溝在正常發育中會退化，其殘留的頸竇（cervical sinus of His）若閉鎖不全，會形成鰓竇／鰓囊腫等異常。104/109
- agent 預評：好 — 104-1 Q30 正答 C 頸竇閉鎖不全形成鰓竇，卡答案即考點。
- owner：

#### `pharyngeal-arches#k12`
- 卡面：呼吸原基（respiratory primordium，即喉氣管憩室laryngotracheal diverticulum）起源於【＿＿＿】後方、原始咽（primordial pharynx）尾端腹側壁，日後發育為喉、氣管、支氣管及肺的上皮（皆為內胚層來源）。107
- 答案：**第四咽囊**
- 原句：呼吸原基（respiratory primordium，即喉氣管憩室laryngotracheal diverticulum）起源於第四咽囊後方、原始咽（primordial pharynx）尾端腹側壁，日後發育為喉、氣管、支氣管及肺的上皮（皆為內胚層來源）。107
- agent 預評：好 — 107-1 Q32 正答 D 第四咽囊，答案唯一。
- owner：

#### `pharyngeal-arches#k15`
- 卡面：顏面由額鼻突起（frontonasal prominence，再分內側鼻突與外側鼻突）與上頷突起（maxillary prominence）共同融合而成：內側鼻突融合形成的中頷節（intermaxillary segment）發育為原始腭（primary palate，【…】）；上頷突起的腭側突向上翻轉、往內側融合形成次級腭（secondary palate）。【＿＿＿】（【…】）是原始腭與次級腭的交界，也是前腭唇裂與後腭唇裂的分界指標。105
- 答案：**門齒窩**　（一併遮住：incisive fossa）　（洩題片語遮住：即門齒窩以前的區域及四顆門牙）
- 原句：顏面由額鼻突起（frontonasal prominence，再分內側鼻突與外側鼻突）與上頷突起（maxillary prominence）共同融合而成：內側鼻突融合形成的中頷節（intermaxillary segment）發育為原始腭（primary palate，即門齒窩以前的區域及四顆門牙）；上頷突起的腭側突向上翻轉、往內側融合形成次級腭（secondary palate）。門齒窩（incisive fossa）是原始腭與次級腭的交界，也是前腭唇裂與後腭唇裂的分界指標。105
- agent 預評：—
- owner：

### 心臟血管系統發育（Cardiovascular System Development）（常青必掃）

#### `cardiovascular-development#k1`
- 卡面：新生兒出生開始用肺呼吸時，主要變化是【＿＿＿】（【…】），【…】、【…】；同時體循環壓力大於肺循環，使左心房壓力大於右心房，促使卵圓孔瓣膜貼合第二中隔而完成功能性關閉。113
- 答案：**肺部血流量上升**　（一併遮住：供氣體交換所需）　（洩題片語遮住：而非肺血管阻力顯著上升；也非肺動脈管壁顯著增厚）
- 原句：新生兒出生開始用肺呼吸時，主要變化是肺部血流量上升（供氣體交換所需），而非肺血管阻力顯著上升、也非肺動脈管壁顯著增厚；同時體循環壓力大於肺循環，使左心房壓力大於右心房，促使卵圓孔瓣膜貼合第二中隔而完成功能性關閉。113
- agent 預評：普通 — 113-1 Q35 正答 B 肺血流上升；但自由作答「肺血管阻力下降」同樣正確，答案不唯一。
- owner：

#### `cardiovascular-development#k13`
- 卡面：出生後動脈導管閉鎖形成【＿＿＿】（【…】），位於主動脈弓與肺動脈幹之間；左側喉返神經【…】，右側喉返神經則繞右鎖骨下動脈折返——左右喉返神經路徑不同，根源正是左右第四、六咽弓動脈發育不對稱。104/108
- 答案：**動脈韌帶**　（一併遮住：ligamentum arteriosum）　（洩題片語遮住：繞行動脈韌帶後折返）
- 原句：出生後動脈導管閉鎖形成動脈韌帶（ligamentum arteriosum），位於主動脈弓與肺動脈幹之間；左側喉返神經繞行動脈韌帶後折返，右側喉返神經則繞右鎖骨下動脈折返——左右喉返神經路徑不同，根源正是左右第四、六咽弓動脈發育不對稱。104/108
- agent 預評：—
- owner：

### 體壁與橫膈發育（Body Wall and Diaphragm Development）（穩定考點）

#### `body-wall-diaphragm-development#k5`
- 卡面：胸腹膜若未在第 6 週末與橫中隔、食道背側繫膜完全融合，會造成先天性橫膈疝（CDH）；最好發位置是橫膈【＿＿＿】（【…】）的 Bochdalek 孔，佔 CDH 九成以上，且左側（約 80–85%）多於右側。104
- 答案：**後外側**　（一併遮住：posterolateral）
- 原句：胸腹膜若未在第 6 週末與橫中隔、食道背側繫膜完全融合，會造成先天性橫膈疝（CDH）；最好發位置是橫膈後外側（posterolateral）的 Bochdalek 孔，佔 CDH 九成以上，且左側（約 80–85%）多於右側。104
- agent 預評：不好 — 104-1 Q29 正答 D 後外側，但緊接的「Bochdalek 孔」即後外側疝的同義名稱，洩題。
- owner：

#### `body-wall-diaphragm-development#k3`
- 卡面：胸心包膜（pleuropericardial membrane）將胸膜腔與心包腔分隔開來，本身演變為【＿＿＿】（【…】）（【…】）；膜內含膈神經與總主靜脈（common cardinal vein）。107/111
- 答案：**纖維性心包膜**　（一併遮住：fibrous pericardium）　（洩題片語遮住：而非漿液心包膜的臟層）
- 原句：胸心包膜（pleuropericardial membrane）將胸膜腔與心包腔分隔開來，本身演變為纖維性心包膜（fibrous pericardium）（而非漿液心包膜的臟層）；膜內含膈神經與總主靜脈（common cardinal vein）。107/111
- agent 預評：好 — 111-2 Q32 否定題給分 A（漿液心包膜臟層）為錯誤敘述，卡答纖維性心包膜與之一致。
- owner：

#### `body-wall-diaphragm-development#k4`
- 卡面：胚內體腔（intraembryonic coelom）最早出現於【＿＿＿】（【…】）——其壁層（parietal layer）日後形成襯覆體腔的漿膜（腹膜、肋膜、心包膜），【…】。113
- 答案：**外側（側板）中胚層**　（一併遮住：lateral mesoderm）　（洩題片語遮住：並非源自軸旁中胚層、中間中胚層或內胚層）
- 原句：胚內體腔（intraembryonic coelom）最早出現於外側（側板）中胚層（lateral mesoderm）——其壁層（parietal layer）日後形成襯覆體腔的漿膜（腹膜、肋膜、心包膜），並非源自軸旁中胚層、中間中胚層或內胚層。113
- agent 預評：不好 — 113-1 Q32 正答 C，但「並非軸旁、中間中胚層或內胚層」把其他選項全列出，刪去即得，洩題。
- owner：

### 四肢與中軸骨骼肌肉系統發育（Limb and Axial Musculoskeletal Development）（穩定考點）

#### `limb-axial-musculoskeletal-development#k5`
- 卡面：肢芽（limb bud）於胚胎【＿＿＿】出現於體壁腹外側，遠端外胚層增厚形成頂外胚層嵴（apical ectodermal ridge, AER），誘導其下方的間葉組織（progress zone）快速增生，帶動肢體由近端往遠端生長；下肢芽的發育較上肢芽晚約 1 至 2 天。111
- 答案：**第 4 週末**
- 原句：肢芽（limb bud）於胚胎第 4 週末出現於體壁腹外側，遠端外胚層增厚形成頂外胚層嵴（apical ectodermal ridge, AER），誘導其下方的間葉組織（progress zone）快速增生，帶動肢體由近端往遠端生長；下肢芽的發育較上肢芽晚約 1 至 2 天。111
- agent 預評：普通 — 111-1 Q36（否定題）給分D為旋轉方向；『第四週末』出現於未給分選項A為正確敘述，屬旁支數字
- owner：

#### `limb-axial-musculoskeletal-development#k9`
- 卡面：顱蓋（calvaria）的囟門中，後囟門（posterior fontanelle，即枕囟門／lambda）最早關閉，前囟門（anterior fontanelle，即額囟門／bregma）最晚關閉；顱縫提早癒合（craniosynostosis）會依部位產生特定頭型，其中【＿＿＿】（【…】）提早閉合會造成前後拉長、左右狹窄的舟狀頭（scaphocephaly）。110/112
- 答案：**矢狀縫**　（一併遮住：sagittal suture）
- 原句：顱蓋（calvaria）的囟門中，後囟門（posterior fontanelle，即枕囟門／lambda）最早關閉，前囟門（anterior fontanelle，即額囟門／bregma）最晚關閉；顱縫提早癒合（craniosynostosis）會依部位產生特定頭型，其中矢狀縫（sagittal suture）提早閉合會造成前後拉長、左右狹窄的舟狀頭（scaphocephaly）。110/112
- agent 預評：好 — 112-2 Q36 正答 D 矢狀縫，卡答案即考點。
- owner：

#### `limb-axial-musculoskeletal-development#k10`
- 卡面：【＿＿＿】（【…】）由軸旁中胚層（paraxial mesoderm）衍生而來——脊索（notochord）來自原結、體腔來自外側中胚層、原條來自尾端外胚層，【…】；【…】：生骨節（形成中軸骨骼）、肌節（形成骨骼肌）、皮節（形成真皮）。111
- 答案：**體節**　（一併遮住：somite）　（洩題片語遮住：皆非體節的直接來源；每個體節再分化出三部分）
- 原句：體節（somite）由軸旁中胚層（paraxial mesoderm）衍生而來——脊索（notochord）來自原結、體腔來自外側中胚層、原條來自尾端外胚層，皆非體節的直接來源；每個體節再分化出三部分：生骨節（形成中軸骨骼）、肌節（形成骨骼肌）、皮節（形成真皮）。111
- agent 預評：—
- owner：

### 消化系統發育（Gastrointestinal System Development）（常青必掃）

#### `GI-development#k2`
- 卡面：肝細胞於胚胎【＿＿＿】開始製造膽汁；此時膽囊與膽管（含連接肝管形成的總膽管）已發育完成，膽汁得以進入腸道。106
- 答案：**第 12 週**
- 原句：肝細胞於胚胎第 12 週開始製造膽汁；此時膽囊與膽管（含連接肝管形成的總膽管）已發育完成，膽汁得以進入腸道。106
- agent 預評：好 — 106-1 Q29 正答 C 第 12 週，數字本身即考點。
- owner：

#### `GI-development#k15`
- 卡面：肛管以齒狀線／肛門膜為界分兩段：上 2/3 來自後腸內胚層，內襯單層柱狀上皮；下 1/3 來自【＿＿＿】（【…】）外胚層，內襯複層鱗狀上皮——第 26 天尿囊與後腸共同開口形成泄殖腔，被尿直腸中隔（urorectal septum）分隔後，肛門膜約於第 9 週破裂，開通肛管下 1/3（考選部 104-2）。104
- 答案：**原肛**　（一併遮住：proctodeum）
- 原句：肛管以齒狀線／肛門膜為界分兩段：上 2/3 來自後腸內胚層，內襯單層柱狀上皮；下 1/3 來自原肛（proctodeum）外胚層，內襯複層鱗狀上皮——第 26 天尿囊與後腸共同開口形成泄殖腔，被尿直腸中隔（urorectal septum）分隔後，肛門膜約於第 9 週破裂，開通肛管下 1/3（考選部 104-2）。104
- agent 預評：—
- owner：

#### `GI-development#k13`
- 卡面：胃的發育有三個常考點：① 胃原基背側生長快於腹側，因而形成胃大彎（greater curvature）；② 沿縱軸順時針旋轉 90 度，把胃大彎轉向左側、小彎轉向右側；③ 旋轉同時把【＿＿＿】（【…】）拉向左側，在胃後方圍出網膜囊（omental bursa）。另外，胃的先天畸形其實少見，臨床最常見的是肥厚性幽門狹窄（hypertrophic pyloric stenosis）、好發於男嬰，幽門閉鎖（pyloric atresia）極為罕見。115-2
- 答案：**原始背側胃繫膜**　（一併遮住：primordial dorsal mesogastrium）
- 原句：胃的發育有三個常考點：① 胃原基背側生長快於腹側，因而形成胃大彎（greater curvature）；② 沿縱軸順時針旋轉 90 度，把胃大彎轉向左側、小彎轉向右側；③ 旋轉同時把原始背側胃繫膜（primordial dorsal mesogastrium）拉向左側，在胃後方圍出網膜囊（omental bursa）。另外，胃的先天畸形其實少見，臨床最常見的是肥厚性幽門狹窄（hypertrophic pyloric stenosis）、好發於男嬰，幽門閉鎖（pyloric atresia）極為罕見。115-2
- agent 預評：好 — 115-2 Q34 正答 C 原始背側胃繫膜，卡答案即考點。
- owner：

### 呼吸系統發育（Respiratory System Development）（穩定考點）

#### `respiratory-development#k8`
- 卡面：新生兒開始以肺呼吸後，【＿＿＿】（【…】）以增加氣體交換；同時左心房壓力升高、大於右心房，促使卵圓孔關閉，符合出生後體循環壓力大於肺循環的生理轉變。113
- 答案：**肺部血流量上升**　（一併遮住：而非血管阻力上升）
- 原句：新生兒開始以肺呼吸後，肺部血流量上升（而非血管阻力上升）以增加氣體交換；同時左心房壓力升高、大於右心房，促使卵圓孔關閉，符合出生後體循環壓力大於肺循環的生理轉變。113
- agent 預評：普通 — 113-1 Q35 正答 B；但「肺血管阻力下降」同樣可填，答案不唯一，且與心血管 k1 重複。
- owner：

### 泌尿生殖系統發育（Urogenital System Development）（常青必掃）

#### `urogenital-development#k13`
- 卡面：三條管路的衍生物一次分清：副中腎管（paramesonephric duct／Müllerian duct）→ 【＿＿＿】、子宮與陰道上段（男性因 Sertoli cell 分泌的 AMH 而退化）；中腎管（mesonephric duct／Wolffian duct）→ 副睪、輸精管、儲精囊與射精管；輸尿管芽（ureteric bud，由中腎管下段長出）→ 輸尿管、腎盂、腎盞與集尿管。【…】；射精管、輸精管、輸尿管三者都不是。115-2
- 答案：**輸卵管**　（洩題片語遮住：問「何者由副中腎管衍生」答輸卵管）
- 原句：三條管路的衍生物一次分清：副中腎管（paramesonephric duct／Müllerian duct）→ 輸卵管、子宮與陰道上段（男性因 Sertoli cell 分泌的 AMH 而退化）；中腎管（mesonephric duct／Wolffian duct）→ 副睪、輸精管、儲精囊與射精管；輸尿管芽（ureteric bud，由中腎管下段長出）→ 輸尿管、腎盂、腎盞與集尿管。問「何者由副中腎管衍生」答輸卵管；射精管、輸精管、輸尿管三者都不是。115-2
- agent 預評：—
- owner：

#### `urogenital-development#k14`
- 卡面：精索積水（hydrocele of the spermatic cord）由【＿＿＿】（【…】）中段閉鎖不全造成，腹膜液滲入精索內腔；【…】，腹膜液大量流入則形成陰囊積水。109
- 答案：**鞘突**　（一併遮住：processus vaginalis）　（洩題片語遮住：若鞘突全程未閉鎖）
- 原句：精索積水（hydrocele of the spermatic cord）由鞘突（processus vaginalis）中段閉鎖不全造成，腹膜液滲入精索內腔；若鞘突全程未閉鎖，腹膜液大量流入則形成陰囊積水。109
- agent 預評：—
- owner：

### 特殊感覺器官與皮膚附屬器發育（Special Sense Organ and Integument Development）（穩定考點）

#### `special-sense-integument-development#k10`
- 卡面：一般肌肉組織（肋間、心臟、消化道）皆由中胚層分化而來，但眼睛的虹膜肌來自【＿＿＿】（【…】）——更精確地說，瞳孔括約肌（sphincter pupillae）與瞳孔開大肌（dilator pupillae）源自視杯（optic cup）【…】，是人體極少數非中胚層來源的平滑肌，也是這類「哪個肌肉不是中胚層」題型的固定答案；【…】，不是生發層（stratum germinativum，那是表皮基底層）。106/115-2
- 答案：**神經外胚層**　（一併遮住：neuroectoderm）　（洩題片語遮住：前緣的神經外胚層；答案要選神經外胚層）
- 原句：一般肌肉組織（肋間、心臟、消化道）皆由中胚層分化而來，但眼睛的虹膜肌來自神經外胚層（neuroectoderm）——更精確地說，瞳孔括約肌（sphincter pupillae）與瞳孔開大肌（dilator pupillae）源自視杯（optic cup）前緣的神經外胚層，是人體極少數非中胚層來源的平滑肌，也是這類「哪個肌肉不是中胚層」題型的固定答案；答案要選神經外胚層，不是生發層（stratum germinativum，那是表皮基底層）。106/115-2
- agent 預評：—
- owner：

## packages/content-neurons-tw/src/handout/寄生蟲學.html

29 張｜有卡考點 17/21

### 腸道土壤傳播線蟲（Soil-Transmitted Intestinal Nematodes）（常青必掃）

#### `intestinal-nematodes-soil-transmitted#k6`
- 卡面：【＿＿＿】（【…】）感染唯人類，好發於 5–9 歲兒童；蟲卵於小腸孵化後幼蟲循心肺移行路徑（鑽小腸壁→肝→心→肺→穿肺泡壁→氣管→會厭→小腸）發育為成蟲；重度感染幼童最容易出現異位性移行（ectopic migration）——蟲體鑽出正常路徑跑到膽道、胰管等處造成阻塞，是【…】的招牌考點。111
- 答案：**蛔蟲**　（一併遮住：Ascaris lumbricoides）　（洩題片語遮住：蛔蟲區別於其他腸道線蟲）
- 原句：蛔蟲（Ascaris lumbricoides）感染唯人類，好發於 5–9 歲兒童；蟲卵於小腸孵化後幼蟲循心肺移行路徑（鑽小腸壁→肝→心→肺→穿肺泡壁→氣管→會厭→小腸）發育為成蟲；重度感染幼童最容易出現異位性移行（ectopic migration）——蟲體鑽出正常路徑跑到膽道、胰管等處造成阻塞，是蛔蟲區別於其他腸道線蟲的招牌考點。111
- agent 預評：—
- owner：

### 食因性與組織線蟲（Foodborne and Tissue-Invasive Nematodes）（常青必掃）

#### `foodborne-tissue-nematodes#k11`
- 卡面：【＿＿＿】（【…】）經食用受污染的淡水魚感染（人與食魚水鳥皆為終宿主），成蟲寄生小腸並具自體感染能力；長期感染造成腸道吸收不良、蛋白質流失，臨床可見腹瀉、低蛋白血症、低血鉀、低血鈣等嚴重電解質失衡，腹瀉病患須積極補充電解質。104/109/110
- 答案：**菲律賓毛線蟲**　（一併遮住：Capillaria philippinensis）
- 原句：菲律賓毛線蟲（Capillaria philippinensis）經食用受污染的淡水魚感染（人與食魚水鳥皆為終宿主），成蟲寄生小腸並具自體感染能力；長期感染造成腸道吸收不良、蛋白質流失，臨床可見腹瀉、低蛋白血症、低血鉀、低血鈣等嚴重電解質失衡，腹瀉病患須積極補充電解質。104/109/110
- agent 預評：好 — 110-1 Q29 臨床情境即答菲律賓毛線蟲（A），104-1 Q76 同點；英文已遮。
- owner：

#### `foodborne-tissue-nematodes#k12`
- 卡面：【＿＿＿】（【…】）經食入未熟帶蟲豬肉（或熊肉）感染；人與豬同時身兼終宿主與中間宿主；幼蟲隨血液循環到達橫紋肌並發育、囊化；症狀依病程分三期——腸道期腸胃症狀→肌肉侵犯（移行）期先出現局部（尤其眼眶周圍）水腫，並伴隨發燒、肌肉痛與高嗜伊紅性白血球症→囊化期症狀逐漸消退，肌肉痛不是最早出現的症狀，是常見誘答。106/115
- 答案：**旋毛蟲**　（一併遮住：Trichinella spiralis）
- 原句：旋毛蟲（Trichinella spiralis）經食入未熟帶蟲豬肉（或熊肉）感染；人與豬同時身兼終宿主與中間宿主；幼蟲隨血液循環到達橫紋肌並發育、囊化；症狀依病程分三期——腸道期腸胃症狀→肌肉侵犯（移行）期先出現局部（尤其眼眶周圍）水腫，並伴隨發燒、肌肉痛與高嗜伊紅性白血球症→囊化期症狀逐漸消退，肌肉痛不是最早出現的症狀，是常見誘答。106/115
- agent 預評：好 — 115-1 Q29 答旋毛蟲（D），106-1 Q76 各敘述與卡一致。
- owner：

#### `foodborne-tissue-nematodes#k13`
- 卡面：【＿＿＿】（【…】）經食用海水魚生魚片（壽司／生魚片）感染，需經兩種中間宿主（海水甲殼類→海水魚／烏賊）才具感染力；幼蟲鑽入胃或十二指腸壁，造成急性腹痛、胃部顯影攝影可見線狀填充物缺陷（threadlike filling defect），病理上為嗜伊紅性肉芽腫，常被誤認為胃癌；診斷靠胃鏡直視並摘除幼蟲，不是檢查糞便中的蟲卵。105/108
- 答案：**海獸胃線蟲**　（一併遮住：Anisakis spp.）
- 原句：海獸胃線蟲（Anisakis spp.）經食用海水魚生魚片（壽司／生魚片）感染，需經兩種中間宿主（海水甲殼類→海水魚／烏賊）才具感染力；幼蟲鑽入胃或十二指腸壁，造成急性腹痛、胃部顯影攝影可見線狀填充物缺陷（threadlike filling defect），病理上為嗜伊紅性肉芽腫，常被誤認為胃癌；診斷靠胃鏡直視並摘除幼蟲，不是檢查糞便中的蟲卵。105/108
- agent 預評：好 — 105-2 Q75 生魚片＋線狀填充缺陷答海獸胃線蟲（B）；108-1 Q29 否定題給分 B（糞便檢卵）與卡一致。
- owner：

#### `foodborne-tissue-nematodes#k14`
- 卡面：肝毛線蟲（Capillaria hepatica）終宿主主要為齧齒類，人偶然感染；食入土壤中的胚胎化蟲卵後，幼蟲在腸道孵出、經肝門靜脈到達肝臟發育為成蟲，並於肝實質產卵，【…】須在肝臟活體切片中發現蟲體或蟲卵才能確診；若只是在糞便中發現肝毛線蟲蟲卵（多因食入受感染齧齒類肝臟後蟲卵單純通過腸道排出），屬於【＿＿＿】（【…】），【…】，是本科少見但曾出現的陷阱題。113
- 答案：**假性感染**　（一併遮住：spurious infection）　（洩題片語遮住：並非真正的肝內感染；真感染）
- 原句：肝毛線蟲（Capillaria hepatica）終宿主主要為齧齒類，人偶然感染；食入土壤中的胚胎化蟲卵後，幼蟲在腸道孵出、經肝門靜脈到達肝臟發育為成蟲，並於肝實質產卵，真感染須在肝臟活體切片中發現蟲體或蟲卵才能確診；若只是在糞便中發現肝毛線蟲蟲卵（多因食入受感染齧齒類肝臟後蟲卵單純通過腸道排出），屬於假性感染（spurious infection），並非真正的肝內感染，是本科少見但曾出現的陷阱題。113
- agent 預評：不好 — 113-2 Q29 答假性感染（D），但句中「真感染須…」＋「並非真正的肝內感染」對比直接推出「假性」，洩題。
- owner：

#### `foodborne-tissue-nematodes#k15`
- 卡面：【＿＿＿】（【…】）成蟲寄生於貓狗胃壁（人為非適當宿主，不會長成成蟲），需經水蚤（第一中間宿主）與淡水魚／蛙（第二中間宿主）兩種中間宿主，也可經蛙肉敷傷口感染；感染人體後同時可造成皮膚幼蟲移行症（爬行疹）與內臟幼蟲移行症（嗜伊紅性腦脊髓炎），並非「只侵犯皮下組織」；侵犯眼周可造成長江浮腫（眼周浮腫）與【…】。111/112
- 答案：**棘顎口線蟲**　（一併遮住：Gnathostoma spinigerum）　（洩題片語遮住：眼球棘顎口線蟲症）
- 原句：棘顎口線蟲（Gnathostoma spinigerum）成蟲寄生於貓狗胃壁（人為非適當宿主，不會長成成蟲），需經水蚤（第一中間宿主）與淡水魚／蛙（第二中間宿主）兩種中間宿主，也可經蛙肉敷傷口感染；感染人體後同時可造成皮膚幼蟲移行症（爬行疹）與內臟幼蟲移行症（嗜伊紅性腦脊髓炎），並非「只侵犯皮下組織」；侵犯眼周可造成長江浮腫（眼周浮腫）與眼球棘顎口線蟲症。111/112
- agent 預評：—
- owner：

### 淋巴絲蟲病與皮下絲蟲病（Lymphatic and Subcutaneous Filariasis）（穩定考點）

#### `lymphatic-and-subcutaneous-filariasis#k7`
- 卡面：班氏絲蟲（Wuchereria bancrofti）病媒為熱帶家蚊（曾流行於台澎金馬及中國南方）；成蟲寄生於淋巴管，微絲蟲具有夜間週期性（白天聚集於肺部小血管，夜間才大量出現於末梢血液），臨床上可用 【＿＿＿】（【…】）誘發試驗讓微絲蟲白天也能被採血檢出；感染造成淋巴管炎、象皮病、陰囊水腫、乳糜尿。106/108/112
- 答案：**diethylcarbamazine**　（一併遮住：DEC）
- 原句：班氏絲蟲（Wuchereria bancrofti）病媒為熱帶家蚊（曾流行於台澎金馬及中國南方）；成蟲寄生於淋巴管，微絲蟲具有夜間週期性（白天聚集於肺部小血管，夜間才大量出現於末梢血液），臨床上可用 diethylcarbamazine（DEC）誘發試驗讓微絲蟲白天也能被採血檢出；感染造成淋巴管炎、象皮病、陰囊水腫、乳糜尿。106/108/112
- agent 預評：好 — 106-2 Q29 答 diethylcarbamazine（B），縮寫 DEC 已遮。
- owner：

#### `lymphatic-and-subcutaneous-filariasis#k8`
- 卡面：羅阿絲蟲（Loa loa）病媒為虻（Chrysops，鹿蠅）；成蟲主要寄生於【＿＿＿】、微絲蟲於白天出現在血液中；【…】，但多不引起劇痛，只因蟲體分泌物過敏反應造成暫時性的卡拉巴腫（Calabar swelling）；跑到眼結膜下可造成眼蟲病（大量流淚、疼痛、不安），但不會造成失明——會致盲的是蟠尾絲蟲。104
- 答案：**皮下組織**　（洩題片語遮住：成蟲移行雖在皮下）
- 原句：羅阿絲蟲（Loa loa）病媒為虻（Chrysops，鹿蠅）；成蟲主要寄生於皮下組織、微絲蟲於白天出現在血液中；成蟲移行雖在皮下，但多不引起劇痛，只因蟲體分泌物過敏反應造成暫時性的卡拉巴腫（Calabar swelling）；跑到眼結膜下可造成眼蟲病（大量流淚、疼痛、不安），但不會造成失明——會致盲的是蟠尾絲蟲。104
- agent 預評：不好 — 104-2 Q75 否定題給分 B（劇痛），A 皮下組織為正確敘述；但後文「成蟲移行雖在皮下」重述洩題。
- owner：

#### `lymphatic-and-subcutaneous-filariasis#k9`
- 卡面：蟠尾絲蟲（Onchocerca volvulus）病媒為蚋（Simulium，黑蠅）；微絲蟲定居於【…】與尿液中，【＿＿＿】（【…】）是主要診斷方法；重複感染可造成河川盲症（river blindness）、皮疹、硬而不痛的【…】、豹皮花紋（leopard skin）、鼠蹊懸垂（hanging groin）；肺部結節／錢幣狀病灶不是蟠尾絲蟲的表現，那是犬心絲蟲（Dirofilaria immitis）的特徵，兩者常被放在一起誘答。106/107/110/111
- 答案：**皮下切片**　（一併遮住：skin snips）　（洩題片語遮住：皮膚（真皮層）；皮下結節）
- 原句：蟠尾絲蟲（Onchocerca volvulus）病媒為蚋（Simulium，黑蠅）；微絲蟲定居於皮膚（真皮層）與尿液中，皮下切片（skin snips）是主要診斷方法；重複感染可造成河川盲症（river blindness）、皮疹、硬而不痛的皮下結節、豹皮花紋（leopard skin）、鼠蹊懸垂（hanging groin）；肺部結節／錢幣狀病灶不是蟠尾絲蟲的表現，那是犬心絲蟲（Dirofilaria immitis）的特徵，兩者常被放在一起誘答。106/107/110/111
- agent 預評：好 — 107-2 Q30 皮下切片答蟠尾絲蟲（B）、110-2 Q29 B 為正確敘述；skin snips 已遮。
- owner：

### 廣東住血線蟲症與幼蟲移行症（Angiostrongyliasis and Larva Migrans Syndromes）（穩定考點）

#### `angiostrongyliasis-and-larva-migrans#k9`
- 卡面：【＿＿＿】（【…】）【…】，人為偶然宿主（幼蟲不會長成成蟲）；食入含胚卵的糞便污染物後，幼蟲在體內到處遊走造成內臟幼蟲移行症（VLM），最容易侵犯肝臟（肝腫大），也常侵犯肺（咳嗽）、眼睛（視網膜剝離，即眼部幼蟲移行症）、腦部；臨床特徵為高嗜伊紅性白血球症、高球蛋白血症、嗜伊紅性肉芽腫；好發於幼童（非成年人），因幼兒接觸受污染土壤／【…】機會較高。107/114
- 答案：**犬蛔蟲／貓蛔蟲**　（一併遮住：Toxocara canis/cati）　（洩題片語遮住：終宿主為狗／貓；犬貓糞便）
- 原句：犬蛔蟲／貓蛔蟲（Toxocara canis/cati）終宿主為狗／貓，人為偶然宿主（幼蟲不會長成成蟲）；食入含胚卵的糞便污染物後，幼蟲在體內到處遊走造成內臟幼蟲移行症（VLM），最容易侵犯肝臟（肝腫大），也常侵犯肺（咳嗽）、眼睛（視網膜剝離，即眼部幼蟲移行症）、腦部；臨床特徵為高嗜伊紅性白血球症、高球蛋白血症、嗜伊紅性肉芽腫；好發於幼童（非成年人），因幼兒接觸受污染土壤／犬貓糞便機會較高。107/114
- agent 預評：普通 — 114-2 Q30 答犬蛔蟲（D）、107-1 Q30 同主題；但緊接「終宿主為狗／貓」與「犬貓糞便」洩出答案一半。
- owner：

### 肝吸蟲與腸道吸蟲（Liver and Intestinal Flukes）（穩定考點）

#### `liver-and-intestinal-flukes#k7`
- 卡面：【＿＿＿】（【…】）是人體內最小的吸蟲之一，經生食淡水魚感染，特徵是除口、腹吸盤外，在生殖孔附近另有第三吸盤（吸蟲中唯一）；成蟲鑽入腸黏膜產卵，蟲卵細小可進入微血管，隨血流、淋巴移行至心臟、腦部等處造成異位病變。104-2/110-1
- 答案：**異形吸蟲**　（一併遮住：Heterophyes heterophyes）
- 原句：異形吸蟲（Heterophyes heterophyes）是人體內最小的吸蟲之一，經生食淡水魚感染，特徵是除口、腹吸盤外，在生殖孔附近另有第三吸盤（吸蟲中唯一）；成蟲鑽入腸黏膜產卵，蟲卵細小可進入微血管，隨血流、淋巴移行至心臟、腦部等處造成異位病變。104-2/110-1
- agent 預評：好 — 104-2 Q77 第三吸盤答異形吸蟲（B）；英文已遮。
- owner：

### 血吸蟲症（Schistosomiasis）（穩定考點）

#### `schistosomiasis#k7`
- 卡面：血吸蟲與其他吸蟲最大的差異在感染途徑：血吸蟲的尾動幼蟲（cercaria）【＿＿＿】，【…】（metacercaria）——第一中間宿主（螺類）【…】。111-2/113-2
- 答案：**直接經皮膚鑽入人體**　（洩題片語遮住：不需要第二中間宿主形成囊幼；就是全部所需的中間宿主）
- 原句：血吸蟲與其他吸蟲最大的差異在感染途徑：血吸蟲的尾動幼蟲（cercaria）直接經皮膚鑽入人體，不需要第二中間宿主形成囊幼（metacercaria）——第一中間宿主（螺類）就是全部所需的中間宿主。111-2/113-2
- agent 預評：—
- owner：

### 肺吸蟲症與吸蟲異位病變（Paragonimiasis and Ectopic Fluke Lesions）（穩定考點）

#### `paragonimiasis-and-ectopic-lesions#k7`
- 卡面：衛氏肺吸蟲（Paragonimus westermani）第一中間宿主為淡水螺類，第二中間宿主為【…】；人類經食入生食、鹽漬、醃製或未煮熟的【＿＿＿】而感染，感染型態是囊狀幼蟲（metacercaria），並非尾動幼蟲鑽皮、也不是食入水生植物或淡水魚。106-2/108-1/115-1
- 答案：**淡水蟹／螯蝦**　（洩題片語遮住：蟹類與淡水螯蝦）
- 原句：衛氏肺吸蟲（Paragonimus westermani）第一中間宿主為淡水螺類，第二中間宿主為蟹類與淡水螯蝦；人類經食入生食、鹽漬、醃製或未煮熟的淡水蟹／螯蝦而感染，感染型態是囊狀幼蟲（metacercaria），並非尾動幼蟲鑽皮、也不是食入水生植物或淡水魚。106-2/108-1/115-1
- agent 預評：—
- owner：

#### `paragonimiasis-and-ectopic-lesions#k6`
- 卡面：美國有原生的【＿＿＿】（【…】），與衛氏肺吸蟲近緣，生食進口自美國的生鮮蝲蛄（crayfish）同樣有感染風險。105-2
- 答案：**克氏肺吸蟲**　（一併遮住：Paragonimus kellicotti）
- 原句：美國有原生的克氏肺吸蟲（Paragonimus kellicotti），與衛氏肺吸蟲近緣，生食進口自美國的生鮮蝲蛄（crayfish）同樣有感染風險。105-2
- agent 預評：普通 — 105-2 Q78 C（蝲蛄→克氏肺吸蟲）為正確敘述（否定題給分 B）；冷門點，且「與衛氏肺吸蟲近緣」洩出「肺吸蟲」。
- owner：

### 包生絛蟲症與小型絛蟲（Echinococcus, Hymenolepis, Dipylidium）（穩定考點）

#### `echinococcosis-and-small-tapeworms#k5`
- 卡面：顆粒性（單胞）包生絛蟲 E. granulosus：終宿主為狗，中間宿主為羊等草食動物；人因誤食蟲卵而感染（不是吃到未煮熟羊肉），主要在【＿＿＿】形成單房性包生囊（hydatid cyst），亦可波及肺部。105/110/112
- 答案：**肝臟**
- 原句：顆粒性（單胞）包生絛蟲 E. granulosus：終宿主為狗，中間宿主為羊等草食動物；人因誤食蟲卵而感染（不是吃到未煮熟羊肉），主要在肝臟形成單房性包生囊（hydatid cyst），亦可波及肺部。105/110/112
- agent 預評：好 — 110-1 Q31 B（肝臟包生囊）為官方答案；105-2 Q77 ②（肌肉）為錯誤敘述，一致。
- owner：

### 條蟲病與囊尾幼蟲症（Taeniasis and Cysticercosis: T. solium vs T. saginata）（穩定考點）

#### `taeniasis-and-cysticercosis#k4`
- 卡面：神經性囊尾幼蟲症（neurocysticercosis）最常見的病因是豬肉絛蟲；約 70% 感染者會出現【＿＿＿】（【…】）；血清或腦脊液抗體／抗原檢查有助診斷（血清敏感度約 80%、腦脊液約 90%）；影像學典型可見腦實質或腦室內多發囊體。108/111/115
- 答案：**癲癇**　（一併遮住：epilepsy）
- 原句：神經性囊尾幼蟲症（neurocysticercosis）最常見的病因是豬肉絛蟲；約 70% 感染者會出現癲癇（epilepsy）；血清或腦脊液抗體／抗原檢查有助診斷（血清敏感度約 80%、腦脊液約 90%）；影像學典型可見腦實質或腦室內多發囊體。108/111/115
- agent 預評：好 — 108-1 Q32 C（癲癇）為正確敘述（否定題給分 A）；英文已遮。
- owner：

### 廣節裂頭絛蟲症與孔雀蚴／裂頭蚴移行症（Diphyllobothriasis and Sparganosis）（穩定考點）

#### `diphyllobothriasis-and-sparganosis#k9`
- 卡面：廣節裂頭絛蟲生活史：蟲卵（有【＿＿＿】 【…】）落水孵出纖毛幼蟲 → 第一中間宿主劍水蚤體內發育成原尾幼蟲 → 第二中間宿主淡水魚體內發育成長尾幼蟲（plerocercoid，人類感染期） → 人吃進未熟或醃製魚肉，成蟲寄生於小腸（空腸）。105/111
- 答案：**卵蓋**　（洩題片語遮住：operculum）
- 原句：廣節裂頭絛蟲生活史：蟲卵（有卵蓋 operculum）落水孵出纖毛幼蟲 → 第一中間宿主劍水蚤體內發育成原尾幼蟲 → 第二中間宿主淡水魚體內發育成長尾幼蟲（plerocercoid，人類感染期） → 人吃進未熟或醃製魚肉，成蟲寄生於小腸（空腸）。105/111
- agent 預評：—
- owner：

#### `diphyllobothriasis-and-sparganosis#k4`
- 卡面：裂頭蚴移行症（sparganosis）感染途徑：飲用受感染劍水蚤污染的水、食用未熟蛙肉或蛇肉，或民間敷蛙肉／蛇肉於傷口或眼睛；因人類非其終宿主（貓、狗才是），幼蟲無法發育成成蟲，只能在組織間到處移行，形成移行性病灶，與 Echinococcus 穩定成囊的型態不同。「以搗碎蛙肉敷眼消腫、數週後眼周水腫發炎」是考選部反覆使用的經典病史，答【＿＿＿】（【…】）；短小／縮小包膜絛蟲（經口蟲卵或含似囊尾幼蟲的節肢動物）與包生絛蟲（誤食犬糞蟲卵）都與敷蛙肉無關。115-2
- 答案：**曼森裂頭絛蟲**　（一併遮住：Spirometra mansonoides）
- 原句：裂頭蚴移行症（sparganosis）感染途徑：飲用受感染劍水蚤污染的水、食用未熟蛙肉或蛇肉，或民間敷蛙肉／蛇肉於傷口或眼睛；因人類非其終宿主（貓、狗才是），幼蟲無法發育成成蟲，只能在組織間到處移行，形成移行性病灶，與 Echinococcus 穩定成囊的型態不同。「以搗碎蛙肉敷眼消腫、數週後眼周水腫發炎」是考選部反覆使用的經典病史，答曼森裂頭絛蟲（Spirometra mansonoides）；短小／縮小包膜絛蟲（經口蟲卵或含似囊尾幼蟲的節肢動物）與包生絛蟲（誤食犬糞蟲卵）都與敷蛙肉無關。115-2
- agent 預評：好 — 115-2 Q31 敷蛙肉答曼森裂頭絛蟲（C）；前文「裂頭蚴」僅提示部分字，仍需回想「曼森」。
- owner：

### 腸道管腔阿米巴：痢疾阿米巴與非致病性阿米巴（Intestinal Luminal Amoebae — E. histolytica vs Non-Pathogenic Species）（穩定考點）

#### `intestinal-luminal-amoebae#k6`
- 卡面：【＿＿＿】（【…】）的滋養體也會吞噬紅血球，但牠寄生於口腔（【…】），與腸道致病無關；人體寄生性阿米巴的寄生部位並非全部都在大腸。106/107
- 答案：**齒齦阿米巴**　（一併遮住：Entamoeba gingivalis）　（洩題片語遮住：牙齦、齒垢）
- 原句：齒齦阿米巴（Entamoeba gingivalis）的滋養體也會吞噬紅血球，但牠寄生於口腔（牙齦、齒垢），與腸道致病無關；人體寄生性阿米巴的寄生部位並非全部都在大腸。106/107
- agent 預評：不好 — 107-1 Q33 A（齒齦阿米巴吞噬紅血球）為正確敘述（否定題給分 B）；但後文「寄生於口腔（牙齦…）」同義洩題。
- owner：

#### `intestinal-luminal-amoebae#k4`
- 卡面：痢疾阿米巴症（含阿米巴肝膿瘍）的首選治療藥物為 【＿＿＿】；mebendazole 是用於治療腸道蠕蟲，並非治療阿米巴的藥物。106
- 答案：**metronidazole**
- 原句：痢疾阿米巴症（含阿米巴肝膿瘍）的首選治療藥物為 metronidazole；mebendazole 是用於治療腸道蠕蟲，並非治療阿米巴的藥物。106
- agent 預評：好 — 106-1 Q81 B（metronidazole 首選）為正確敘述（否定題給分 D）；106-2 Q34 C mebendazole 為錯誤選項，一致。
- owner：

#### `intestinal-luminal-amoebae#k7`
- 卡面：痢疾阿米巴（Entamoeba histolytica）的滋養體會【＿＿＿】（【…】），是牠與非致病性近親（如哈氏阿米巴）最重要的鑑別特徵；哈氏阿米巴滋養體的【…】。106/108
- 答案：**吞噬紅血球**　（一併遮住：erythrophagocytosis）　（洩題片語遮住：胞內容物是細菌，不含紅血球）
- 原句：痢疾阿米巴（Entamoeba histolytica）的滋養體會吞噬紅血球（erythrophagocytosis），是牠與非致病性近親（如哈氏阿米巴）最重要的鑑別特徵；哈氏阿米巴滋養體的胞內容物是細菌，不含紅血球。106/108
- agent 預評：不好 — 106-1 Q81 C 為正確敘述、108-1 Q34 B 為錯誤選項；但後文「不含紅血球」重述洩題。
- owner：

#### `intestinal-luminal-amoebae#k9`
- 卡面：阿米巴腫（ameboma）是慢性阿米巴感染在腸壁形成的肉芽腫性腫塊，外觀酷似【＿＿＿】，臨床上容易被誤診為【…】或發炎性腸病，需特別留意鑑別診斷。106
- 答案：**惡性腫瘤**　（洩題片語遮住：癌症）
- 原句：阿米巴腫（ameboma）是慢性阿米巴感染在腸壁形成的肉芽腫性腫塊，外觀酷似惡性腫瘤，臨床上容易被誤診為癌症或發炎性腸病，需特別留意鑑別診斷。106
- agent 預評：—
- owner：

### 瘧原蟲與瘧疾（Plasmodium spp. and Malaria）（穩定考點）

#### `malaria-plasmodium#k10`
- 卡面：【＿＿＿】（【…】）：由惡性瘧引發的大量血管內溶血，患者產生抗體攻擊受感染紅血球導致破裂，釋出的血紅素超過結合珠蛋白（haptoglobin）的結合能力而經尿液排出，形成血紅素尿（hemoglobinuria），與自體免疫反應及補體活化有關，並非肝細胞受損所致、也與IFN-γ受體損傷無關。110/115
- 答案：**黑水熱**　（一併遮住：blackwater fever）
- 原句：黑水熱（blackwater fever）：由惡性瘧引發的大量血管內溶血，患者產生抗體攻擊受感染紅血球導致破裂，釋出的血紅素超過結合珠蛋白（haptoglobin）的結合能力而經尿液排出，形成血紅素尿（hemoglobinuria），與自體免疫反應及補體活化有關，並非肝細胞受損所致、也與IFN-γ受體損傷無關。110/115
- agent 預評：—
- owner：

### 利什曼原蟲症（Leishmaniasis）（穩定考點）

#### `leishmaniasis#k5`
- 卡面：【＿＿＿】（【…】）由杜氏利什曼原蟲引起，典型三主症是發燒＋肝脾腫大＋貧血，常合併高球蛋白血症（hypergammaglobulinemia）、血小板與白血球減少（易誤診為再生不能性貧血）；診斷靠骨髓穿刺於巨噬細胞內找到無鞭毛體。104/106/109/111
- 答案：**黑熱病**　（一併遮住：kala-azar）
- 原句：黑熱病（kala-azar）由杜氏利什曼原蟲引起，典型三主症是發燒＋肝脾腫大＋貧血，常合併高球蛋白血症（hypergammaglobulinemia）、血小板與白血球減少（易誤診為再生不能性貧血）；診斷靠骨髓穿刺於巨噬細胞內找到無鞭毛體。104/106/109/111
- agent 預評：好 — 106-2 Q33 答黑熱病（B）、104-2 Q79 同情境；kala-azar 已遮。
- owner：

### 巴貝氏原蟲病（Babesiosis）（穩定考點）

#### `babesiosis#k8`
- 卡面：診斷以【＿＿＿】（【…】）為主；標準治療為克林達黴素（clindamycin）併用奎寧（quinine），另一常用方案是atovaquone併用azithromycin。108/115
- 答案：**血液抹片鏡檢配合免疫螢光抗體試驗**　（一併遮住：IFA）
- 原句：診斷以血液抹片鏡檢配合免疫螢光抗體試驗（IFA）為主；標準治療為克林達黴素（clindamycin）併用奎寧（quinine），另一常用方案是atovaquone併用azithromycin。108/115
- agent 預評：普通 — 108-2 Q35 D 為正確敘述（否定題給分 B）；但答案為兩項並列的長短語，難逐字填出。
- owner：

### 弓蟲症（Toxoplasmosis）（low-yield）

#### `toxoplasmosis#k4`
- 卡面：孕婦於懷孕期間（尤其第一孕期最嚴重）感染急性弓蟲症可能經胎盤垂直傳染，造成胎兒水腦症、腦脊髓炎、視網膜脈絡膜炎；spiramycin是文獻記載用於預防胎兒子宮內感染的藥物之一；弓蟲症在台灣屬於【＿＿＿】。105
- 答案：**第四類法定傳染病**
- 原句：孕婦於懷孕期間（尤其第一孕期最嚴重）感染急性弓蟲症可能經胎盤垂直傳染，造成胎兒水腦症、腦脊髓炎、視網膜脈絡膜炎；spiramycin是文獻記載用於預防胎兒子宮內感染的藥物之一；弓蟲症在台灣屬於第四類法定傳染病。105
- agent 預評：普通 — 105-2 Q80 D（第四類法定傳染病）為正確敘述（否定題給分 A）；行政分類、低價值且可能已過時。
- owner：

### 蝨與蚤：機械性傳播與病媒疾病（Lice, Fleas, and Mechanical Transmission）（穩定考點）

#### `louse-flea-mechanical-vectors#k8`
- 卡面：節肢動物的【＿＿＿】（【…】）是主要排泄器官，負責移除含氮廢物並維持滲透壓平衡，此為正確敘述；同題的「蒼蠅經卵傳播」「腮腺炎經昆蟲媒介」則是常見的錯誤誘答。114
- 答案：**馬氏管**　（一併遮住：Malpighian tubules）
- 原句：節肢動物的馬氏管（Malpighian tubules）是主要排泄器官，負責移除含氮廢物並維持滲透壓平衡，此為正確敘述；同題的「蒼蠅經卵傳播」「腮腺炎經昆蟲媒介」則是常見的錯誤誘答。114
- agent 預評：好 — 114-1 Q35 答 C（馬氏管），英文已遮。
- owner：

### 蜱媒介疾病（Tick-Borne Disease）（穩定考點）

#### `tick-borne-disease#k5`
- 卡面：巴貝氏原蟲症（babesiosis）：Babesia 寄生【＿＿＿】、無性生殖形成【…】，典型為4個merozoite排成馬爾他十字（Maltese cross）；多數患者呈現無症狀之【…】（並非高度寄生蟲血症）；免疫缺損（脾臟切除、癌症、愛滋病）、老年人、5歲以下孩童感染較嚴重甚至致死；臨床診斷以血液抹片配合免疫螢光抗體試驗（IFA）為主。105/108
- 答案：**紅血球內**　（洩題片語遮住：類似瘧原蟲的環狀體；低度寄生蟲血症）
- 原句：巴貝氏原蟲症（babesiosis）：Babesia 寄生紅血球內、無性生殖形成類似瘧原蟲的環狀體，典型為4個merozoite排成馬爾他十字（Maltese cross）；多數患者呈現無症狀之低度寄生蟲血症（並非高度寄生蟲血症）；免疫缺損（脾臟切除、癌症、愛滋病）、老年人、5歲以下孩童感染較嚴重甚至致死；臨床診斷以血液抹片配合免疫螢光抗體試驗（IFA）為主。105/108
- agent 預評：好 — 108-2 Q35 A（寄生紅血球內）為正確敘述；105-2 Q79 紅血球內雙核形亦一致。
- owner：

#### `tick-borne-disease#k8`
- 卡面：軟蜱（Ornithodoros spp.）傳播【＿＿＿】（【…】）與Q熱（Coxiella burnetii；Q熱硬蜱亦可傳播）；黑熱病（白蛉媒介）、戰壕熱（體蝨媒介）、黃熱病（斑蚊媒介）都不是蜱媒介疾病。109
- 答案：**蜱媒回歸熱**　（一併遮住：tick-borne relapsing fever）
- 原句：軟蜱（Ornithodoros spp.）傳播蜱媒回歸熱（tick-borne relapsing fever）與Q熱（Coxiella burnetii；Q熱硬蜱亦可傳播）；黑熱病（白蛉媒介）、戰壕熱（體蝨媒介）、黃熱病（斑蚊媒介）都不是蜱媒介疾病。109
- agent 預評：—
- owner：

