"""Subject classifier for the 106-1 OLD-grouping paper (陽明 subject labels wrong there).

Train on the 34 MODERN papers (考選部 stem -> 陽明 subject, which IS correct for modern years),
predict 106-1's 200 stems constrained by book (醫學一 -> 6 subjects, 醫學二 -> 4 subjects).
"""
import os, re, numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from reconcile import load_ym_paper, norm, sim, BOOK_SUBJECTS
from parse_moex import parse_questions

OLD = {(106, 1)}  # only 106-1 is old grouping (verified)

# 106-1 actual book composition (per 考選部 header):
OLD_BOOK_SUBJECTS = {
    '醫學一': ['解剖學', '胚胎學', '組織學', '微生物暨免疫學', '寄生蟲學', '公共衛生學'],
    '醫學二': ['生理學', '生物化學', '藥理學', '病理學'],
}


def build_training():
    X, y = [], []
    for y_ in range(106, 115):
        for s in [1, 2]:
            if (y_, s) in OLD:
                continue
            for bshort, book in [('一', '醫學一'), ('二', '醫學二')]:
                qp = f'pdf/{y_}/{y_}-{s}_醫學{bshort}_試題.pdf'
                if not os.path.exists(qp):
                    continue
                mq = parse_questions(qp)
                ym = load_ym_paper(y_, s, book)
                for qn in mq:
                    yq = ym.get(qn)
                    if not yq or yq.get('missing'):
                        continue
                    if sim(mq[qn]['stem'], yq['stem']) >= 0.6:  # confident qNum match
                        X.append(mq[qn]['stem'])
                        y.append(yq['subject'])
    return X, y


def make_model():
    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), min_df=2, max_features=40000)
    clf = LinearSVC(C=1.0)
    return vec, clf


def predict_constrained(clf, vec, stems, allowed, classes):
    Xv = vec.transform(stems)
    scores = clf.decision_function(Xv)  # (n, n_classes)
    cls_idx = {c: i for i, c in enumerate(classes)}
    out = []
    for row in scores:
        best, bestsc = None, -1e9
        for a in allowed:
            sc = row[cls_idx[a]]
            if sc > bestsc:
                bestsc, best = sc, a
        out.append((best, round(float(bestsc), 2)))
    return out


def _smooth(labels, scores, window=4):
    """Contiguity smoothing: replace each label with the windowed score-weighted majority."""
    n = len(labels)
    out = list(labels)
    for i in range(n):
        tally = {}
        for j in range(max(0, i - window), min(n, i + window + 1)):
            tally[labels[j]] = tally.get(labels[j], 0.0) + max(scores[j], 0.05)
        out[i] = max(tally, key=tally.get)
    return out


_MODEL = None


def get_model():
    """Train once, cache. Returns (vec, clf, classes)."""
    global _MODEL
    if _MODEL is None:
        X, y = build_training()
        vec, clf = make_model()
        Xv = vec.fit_transform(X)
        clf.fit(Xv, y)
        _MODEL = (vec, clf, list(clf.classes_))
    return _MODEL


def predict_old_paper(year, sess, book, stems):
    """Return smoothed subject labels for an old-grouping paper, book-constrained."""
    vec, clf, classes = get_model()
    preds = predict_constrained(clf, vec, stems, OLD_BOOK_SUBJECTS[book], classes)
    labels = [p[0] for p in preds]
    scores = [p[1] for p in preds]
    return _smooth(labels, scores, window=4), scores


if __name__ == '__main__':
    X, y = build_training()
    print(f'training stems: {len(X)} across {len(set(y))} subjects')
    # held-out accuracy: split by withholding 113 papers
    from sklearn.model_selection import cross_val_score
    vec, clf = make_model()
    Xv = vec.fit_transform(X)
    clf.fit(Xv, y)
    cv = cross_val_score(LinearSVC(C=1.0), Xv, y, cv=4)
    print(f'4-fold CV accuracy: {cv.mean():.3f} (+-{cv.std():.3f})')
    classes = list(clf.classes_)
    # predict 106-1
    for bshort, book in [('一', '醫學一'), ('二', '醫學二')]:
        mq = parse_questions(f'pdf/106/106-1_醫學{bshort}_試題.pdf')
        qns = sorted(mq)
        stems = [mq[n]['stem'] for n in qns]
        preds = predict_constrained(clf, vec, stems, OLD_BOOK_SUBJECTS[book], classes)
        # contiguous block summary
        runs = []
        for qn, (sub, sc) in zip(qns, preds):
            if runs and runs[-1][2] == sub:
                runs[-1][1] = qn
            else:
                runs.append([qn, qn, sub])
        print(f'\n106-1 {book} 預測科目區塊:')
        for a, b, sub in runs:
            print(f'   Q{a:>3}-{b:<3} {sub}')
        low = [(qn, sub, sc) for qn, (sub, sc) in zip(qns, preds) if sc < 0.0]
        print(f'   低信心(<0): {len(low)} {[(q,round(s,1)) for q,su,s in low][:8]}')
