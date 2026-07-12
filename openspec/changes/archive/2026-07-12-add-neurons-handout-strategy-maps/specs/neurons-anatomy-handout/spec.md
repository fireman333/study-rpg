## ADDED Requirements

### Requirement: 每科講義以一週攻略地圖 overview region 開頭

Each subject's 考前講義 SHALL begin with a study-strategy overview region — a `<section class="hdt-region" id="hdt-overview">` containing an `<h2 class="hdt-region__head">` titled 「🗺️ 一週攻略地圖：<科目>怎麼唸」 and a single `<p class="hdt-intro">` covering: a plain-language 導言, a recommended study sequence (①②③④…) that references that subject's actual chapters, how each region is organized, and the honesty caveat that frequency is 投報率參考 only. This overview region SHALL be a **non-quiz region**: it carries no leaves, renders no 測驗本區／本章 CTA, and SHALL be exempt from the region-keyed config↔HTML drift check (the build SHALL NOT require a config entry for it). Overview copy SHALL pass the handout honesty banned-word lint (no 命中率／保證／必考／包中 or other guarantee slang).

#### Scenario: 每科開頭都有一週攻略地圖

- **WHEN** 使用者開啟任一科（全 11 科）的考前講義
- **THEN** 第一個 `.hdt-region` SHALL 是 `id="hdt-overview"` 的一週攻略地圖，標題為「🗺️ 一週攻略地圖：<該科>怎麼唸」

#### Scenario: overview region 不進測驗映射且豁免 drift check

- **WHEN** 執行 region-keyed 科目的 handout build，該科 HTML 含 `hdt-overview` 但 config 未列它
- **THEN** build SHALL NOT throw「HTML region 無 config entry」，SHALL 略過 `hdt-overview` 的 quiz 映射（不產生測驗 CTA），且該科其餘章測驗數不變

#### Scenario: overview 內容過誠實 lint

- **WHEN** build 對 overview region 跑 honesty banned-word lint
- **THEN** overview SHALL NOT 含 命中率／保證會考／保證命中／必中／必考／今年一定考／100%命中／包中 等 guarantee slang
