import crypto from 'crypto';

export type AssessmentMode = 'OBJECTIVE' | 'ESSAY' | 'HYBRID';

export type ObjectiveQuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_SELECT'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'ORDERING'
  | 'FILL_IN_BLANK'
  | 'SHORT_ANSWER'
  | 'NUMERIC';

export type EssayQuestionType =
  | 'SHORT_ESSAY'
  | 'LONG_ESSAY'
  | 'CASE_STUDY'
  | 'ANALYTICAL_RESPONSE'
  | 'PROBLEM_SOLVING'
  | 'PROGRAMMING_EXPLANATION'
  | 'DOCUMENT_RESPONSE';

export type QuestionType = ObjectiveQuestionType | EssayQuestionType;

export interface QuestionOptionRecord {
  id: string;
  optionLabel: string;
  optionText: string;
  optionJson?: any;
  imageObjectKey?: string | null;
  matchRightText?: string | null;
  correctOrderIndex?: number | null;
  isCorrect: boolean;
  scoreWeight?: string | number;
  feedback?: string;
  sortOrder: number;
}

export function deterministicShuffle<T>(items: T[], seedStr?: string): T[] {
  const arr = [...items];
  if (arr.length <= 1) return arr;
  for (let i = arr.length - 1; i > 0; i--) {
    const hash = crypto
      .createHash('sha256')
      .update(`${seedStr || Math.random().toString()}-${i}`)
      .digest();
    const j = hash.readUInt32BE(0) % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Builds the student-safe snapshot (`studentOptionsSnapshot`) and the
 * immutable server-only answer key (`serverAnswerKeySnapshot`) when an attempt starts.
 * CRITICAL SECURITY RULE: `studentOptionsSnapshot` MUST NEVER contain answer keys!
 */
export function buildQuestionSnapshots(params: {
  question: any;
  options: QuestionOptionRecord[];
  rubric?: any;
  randomizeOptions: boolean;
  seedStr: string;
}): {
  studentOptionsSnapshot: Record<string, any>;
  serverAnswerKeySnapshot: Record<string, any>;
} {
  const { question, options, rubric, randomizeOptions, seedStr } = params;
  const qType = (question.questionType || 'SINGLE_CHOICE') as QuestionType;
  const answerConfig = (question.answerConfig || {}) as Record<string, any>;

  const sortedOpts = [...options].sort((a, b) => a.sortOrder - b.sortOrder);

  if (
    qType === 'SINGLE_CHOICE' ||
    qType === 'MULTIPLE_SELECT' ||
    qType === 'TRUE_FALSE'
  ) {
    const orderedForStudent =
      randomizeOptions && qType !== 'TRUE_FALSE'
        ? deterministicShuffle(sortedOpts, seedStr)
        : sortedOpts;

    const studentOptions = orderedForStudent.map((o, idx) => ({
      id: o.id,
      optionLabel: String.fromCharCode(65 + idx),
      originalLabel: o.optionLabel,
      optionText: o.optionText,
      optionJson: o.optionJson || null,
      imageObjectKey: o.imageObjectKey || null,
    }));

    const correctOptionIds = sortedOpts
      .filter((o) => o.isCorrect)
      .map((o) => o.id);

    return {
      studentOptionsSnapshot: {
        questionType: qType,
        options: studentOptions,
      },
      serverAnswerKeySnapshot: {
        questionType: qType,
        correctOptionIds,
        options: sortedOpts.map((o) => ({
          id: o.id,
          optionLabel: o.optionLabel,
          optionText: o.optionText,
          isCorrect: o.isCorrect,
          scoreWeight: Number(o.scoreWeight ?? 100),
          feedback: o.feedback || '',
        })),
        partialCreditEnabled: Boolean(question.partialCreditEnabled),
        negativePoints: Number(question.negativePoints || 0),
      },
    };
  }

  if (qType === 'MATCHING') {
    const rawPairs: Array<{ id: string; leftText: string; rightText: string }> =
      Array.isArray(answerConfig.pairs) && answerConfig.pairs.length > 0
        ? answerConfig.pairs.map((p: any, idx: number) => ({
            id: p.id || `pair-${idx + 1}`,
            leftText: String(p.leftText || ''),
            rightText: String(p.rightText || ''),
          }))
        : sortedOpts.map((o) => ({
            id: o.id,
            leftText: o.optionText,
            rightText: o.matchRightText || o.optionLabel,
          }));

    const rightChoices = deterministicShuffle(
      rawPairs.map((p) => p.rightText),
      `${seedStr}-matching-right`
    );

    return {
      studentOptionsSnapshot: {
        questionType: 'MATCHING',
        leftItems: rawPairs.map((p) => ({
          id: p.id,
          leftText: p.leftText,
        })),
        rightOptions: rightChoices,
      },
      serverAnswerKeySnapshot: {
        questionType: 'MATCHING',
        pairs: rawPairs,
        partialCreditEnabled: Boolean(question.partialCreditEnabled ?? true),
      },
    };
  }

  if (qType === 'ORDERING') {
    const rawItems: Array<{ id: string; text: string; correctOrder: number }> =
      Array.isArray(answerConfig.items) && answerConfig.items.length > 0
        ? answerConfig.items.map((item: any, idx: number) => ({
            id: item.id || `ord-${idx + 1}`,
            text: String(item.text || ''),
            correctOrder: Number(item.correctOrder ?? idx + 1),
          }))
        : sortedOpts.map((o, idx) => ({
            id: o.id,
            text: o.optionText,
            correctOrder: Number(o.correctOrderIndex ?? idx + 1),
          }));

    const orderedCanonical = [...rawItems].sort(
      (a, b) => a.correctOrder - b.correctOrder
    );
    const shuffledForStudent = deterministicShuffle(
      orderedCanonical.map((item) => ({ id: item.id, text: item.text })),
      `${seedStr}-ordering`
    );

    return {
      studentOptionsSnapshot: {
        questionType: 'ORDERING',
        items: shuffledForStudent,
      },
      serverAnswerKeySnapshot: {
        questionType: 'ORDERING',
        correctSequenceIds: orderedCanonical.map((i) => i.id),
        items: orderedCanonical,
        scoringPolicy: answerConfig.scoringPolicy || (question.partialCreditEnabled ? 'PARTIAL' : 'EXACT'),
      },
    };
  }

  if (qType === 'FILL_IN_BLANK') {
    const acceptedAnswers: string[] = Array.isArray(answerConfig.acceptedAnswers)
      ? answerConfig.acceptedAnswers.map(String)
      : [];
    const blanks: Array<{ blankIndex: number; acceptedAnswers: string[] }> =
      Array.isArray(answerConfig.blanks) ? answerConfig.blanks : [];

    return {
      studentOptionsSnapshot: {
        questionType: 'FILL_IN_BLANK',
        blankCount: blanks.length > 0 ? blanks.length : 1,
        caseSensitive: Boolean(answerConfig.caseSensitive),
        placeholder: answerConfig.placeholder || 'Ketik jawaban isian singkat...',
      },
      serverAnswerKeySnapshot: {
        questionType: 'FILL_IN_BLANK',
        acceptedAnswers,
        blanks,
        caseSensitive: Boolean(answerConfig.caseSensitive),
        normalizeWhitespace: answerConfig.normalizeWhitespace !== false,
      },
    };
  }

  if (qType === 'SHORT_ANSWER') {
    const acceptedVariants: string[] = Array.isArray(answerConfig.acceptedVariants)
      ? answerConfig.acceptedVariants.map(String)
      : Array.isArray(answerConfig.acceptedAnswers)
      ? answerConfig.acceptedAnswers.map(String)
      : [];

    return {
      studentOptionsSnapshot: {
        questionType: 'SHORT_ANSWER',
        maxLength: Number(answerConfig.maxLength || 500),
        placeholder: answerConfig.placeholder || 'Tulis jawaban singkat Anda...',
      },
      serverAnswerKeySnapshot: {
        questionType: 'SHORT_ANSWER',
        acceptedVariants,
        matchMode: answerConfig.matchMode || 'CASE_INSENSITIVE', // 'EXACT' | 'CASE_INSENSITIVE' | 'CONTAINS'
        manualReviewFallback: Boolean(answerConfig.manualReviewFallback),
      },
    };
  }

  if (qType === 'NUMERIC') {
    return {
      studentOptionsSnapshot: {
        questionType: 'NUMERIC',
        unit: answerConfig.unit || '',
        decimalPrecision: Number(answerConfig.decimalPrecision ?? 2),
        placeholder: answerConfig.placeholder || 'Masukkan nilai numerik...',
      },
      serverAnswerKeySnapshot: {
        questionType: 'NUMERIC',
        exactValue: Number(answerConfig.exactValue ?? 0),
        tolerance: Number(answerConfig.tolerance ?? 0),
        decimalPrecision: Number(answerConfig.decimalPrecision ?? 2),
        unit: answerConfig.unit || '',
      },
    };
  }

  // ESSAY QUESTION TYPES
  return {
    studentOptionsSnapshot: {
      questionType: qType,
      minWords: Number(answerConfig.minWords || 0),
      maxWords: Number(answerConfig.maxWords || 5000),
      allowAttachments: answerConfig.allowAttachments !== false,
      allowExternalUrl: Boolean(answerConfig.allowExternalUrl),
      allowedExtensions: answerConfig.allowedExtensions || [
        'pdf',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'ppt',
        'pptx',
        'jpg',
        'jpeg',
        'png',
        'webp',
      ],
      rubric: rubric
        ? {
            id: rubric.id,
            title: rubric.title,
            description: rubric.description,
            totalWeight: rubric.totalWeight,
            maxScore: rubric.maxScore,
            criteria: (rubric.criteria || []).map((c: any) => ({
              id: c.id,
              criterionName: c.criterionName,
              description: c.description,
              weight: c.weight,
              maxScore: c.maxScore,
              performanceLevels: c.performanceLevels || [],
            })),
          }
        : null,
    },
    serverAnswerKeySnapshot: {
      questionType: qType,
      modelAnswer: answerConfig.modelAnswer || '',
      gradingGuidelines: answerConfig.gradingGuidelines || '',
      minWords: Number(answerConfig.minWords || 0),
      maxWords: Number(answerConfig.maxWords || 5000),
    },
  };
}

/**
 * Evaluates an objective question answer on the server using the immutable `serverAnswerKeySnapshot`.
 */
export function evaluateObjectiveQuestion(params: {
  questionType: string;
  points: number;
  negativePoints: number;
  partialCreditEnabled: boolean;
  negativeMarkingEnabled: boolean;
  serverAnswerKeySnapshot: Record<string, any>;
  answerPayload: Record<string, any>;
  isAnswered: boolean;
}): {
  isCorrect: boolean;
  partialRatio: number;
  autoScore: number;
  requiresManualReview: boolean;
  gradingStatus: 'UNGRADED' | 'AUTO_GRADED';
} {
  const {
    questionType,
    points,
    negativePoints,
    partialCreditEnabled,
    negativeMarkingEnabled,
    serverAnswerKeySnapshot,
    answerPayload,
    isAnswered,
  } = params;

  if (!isAnswered || !answerPayload || Object.keys(answerPayload).length === 0) {
    return {
      isCorrect: false,
      partialRatio: 0,
      autoScore: 0,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  const maxPts = Math.max(0, Number(points || 0));
  const negPts = negativeMarkingEnabled ? Math.max(0, Number(negativePoints || 0)) : 0;

  if (questionType === 'SINGLE_CHOICE' || questionType === 'TRUE_FALSE') {
    const selectedId =
      answerPayload.selectedOptionId ||
      (Array.isArray(answerPayload.selectedOptionIds)
        ? answerPayload.selectedOptionIds[0]
        : undefined);
    const correctIds: string[] = serverAnswerKeySnapshot.correctOptionIds || [];

    // Also allow boolean/label fallback for TRUE_FALSE if client sent booleanAnswer or optionText
    let matched = false;
    if (selectedId && correctIds.includes(selectedId)) {
      matched = true;
    } else if (
      questionType === 'TRUE_FALSE' &&
      answerPayload.booleanAnswer !== undefined
    ) {
      const targetText = answerPayload.booleanAnswer ? 'true' : 'false';
      const correctOpt = (serverAnswerKeySnapshot.options || []).find(
        (o: any) => o.isCorrect
      );
      if (
        correctOpt &&
        (String(correctOpt.optionText).toLowerCase() === targetText ||
          (answerPayload.booleanAnswer &&
            String(correctOpt.optionText).toLowerCase() === 'benar') ||
          (!answerPayload.booleanAnswer &&
            String(correctOpt.optionText).toLowerCase() === 'salah'))
      ) {
        matched = true;
      }
    }

    const score = matched ? maxPts : negPts > 0 ? -negPts : 0;
    return {
      isCorrect: matched,
      partialRatio: matched ? 1 : 0,
      autoScore: Math.round(score * 100) / 100,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  if (questionType === 'MULTIPLE_SELECT') {
    const selectedIds: string[] = Array.isArray(answerPayload.selectedOptionIds)
      ? answerPayload.selectedOptionIds
      : answerPayload.selectedOptionId
      ? [answerPayload.selectedOptionId]
      : [];
    const correctIds: string[] = serverAnswerKeySnapshot.correctOptionIds || [];
    const allOptions: any[] = serverAnswerKeySnapshot.options || [];

    if (selectedIds.length === 0 || correctIds.length === 0) {
      return {
        isCorrect: false,
        partialRatio: 0,
        autoScore: 0,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    const correctSet = new Set(correctIds);
    const selectedSet = new Set(selectedIds);
    let hitCount = 0;
    let wrongCount = 0;

    for (const id of selectedSet) {
      if (correctSet.has(id)) hitCount++;
      else wrongCount++;
    }

    const isExactMatch =
      hitCount === correctSet.size && wrongCount === 0;

    if (isExactMatch) {
      return {
        isCorrect: true,
        partialRatio: 1,
        autoScore: maxPts,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    if (!partialCreditEnabled) {
      const score = negPts > 0 ? -negPts : 0;
      return {
        isCorrect: false,
        partialRatio: 0,
        autoScore: score,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    // Partial credit: proportional to correct hits minus wrong selections penalty
    const totalOpts = Math.max(allOptions.length, correctSet.size + 1);
    const rawRatio =
      hitCount / correctSet.size - wrongCount / Math.max(1, totalOpts - correctSet.size);
    const clampedRatio = Math.max(0, Math.min(1, rawRatio));
    const computedScore =
      clampedRatio > 0
        ? Math.round(clampedRatio * maxPts * 100) / 100
        : negPts > 0
        ? -negPts
        : 0;

    return {
      isCorrect: false,
      partialRatio: Math.round(clampedRatio * 10000) / 10000,
      autoScore: computedScore,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  if (questionType === 'MATCHING') {
    const expectedPairs: Array<{ id: string; leftText: string; rightText: string }> =
      serverAnswerKeySnapshot.pairs || [];
    const studentPairs: Record<string, string> =
      answerPayload.matchingPairs || answerPayload.matches || {};

    if (expectedPairs.length === 0) {
      return {
        isCorrect: true,
        partialRatio: 1,
        autoScore: maxPts,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    let correctMatches = 0;
    for (const pair of expectedPairs) {
      const studentRight =
        studentPairs[pair.id] ?? studentPairs[pair.leftText];
      if (
        studentRight !== undefined &&
        String(studentRight).trim() === String(pair.rightText).trim()
      ) {
        correctMatches++;
      }
    }

    const ratio = correctMatches / expectedPairs.length;
    const isExact = correctMatches === expectedPairs.length;
    const effectiveRatio = partialCreditEnabled ? ratio : isExact ? 1 : 0;
    const score =
      effectiveRatio > 0
        ? Math.round(effectiveRatio * maxPts * 100) / 100
        : negPts > 0
        ? -negPts
        : 0;

    return {
      isCorrect: isExact,
      partialRatio: Math.round(effectiveRatio * 10000) / 10000,
      autoScore: score,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  if (questionType === 'ORDERING') {
    const correctSeq: string[] =
      serverAnswerKeySnapshot.correctSequenceIds || [];
    const studentSeq: string[] = Array.isArray(answerPayload.orderedItems)
      ? answerPayload.orderedItems
      : Array.isArray(answerPayload.orderedIds)
      ? answerPayload.orderedIds
      : [];

    if (correctSeq.length === 0) {
      return {
        isCorrect: true,
        partialRatio: 1,
        autoScore: maxPts,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    let correctPositions = 0;
    for (let i = 0; i < correctSeq.length; i++) {
      if (studentSeq[i] === correctSeq[i]) {
        correctPositions++;
      }
    }

    const isExact =
      correctPositions === correctSeq.length &&
      studentSeq.length === correctSeq.length;
    const policy = serverAnswerKeySnapshot.scoringPolicy || 'PARTIAL';
    const allowPartial = partialCreditEnabled && policy !== 'EXACT';
    const effectiveRatio = isExact
      ? 1
      : allowPartial
      ? correctPositions / correctSeq.length
      : 0;
    const score =
      effectiveRatio > 0
        ? Math.round(effectiveRatio * maxPts * 100) / 100
        : negPts > 0
        ? -negPts
        : 0;

    return {
      isCorrect: isExact,
      partialRatio: Math.round(effectiveRatio * 10000) / 10000,
      autoScore: score,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  if (questionType === 'FILL_IN_BLANK') {
    const caseSensitive = Boolean(serverAnswerKeySnapshot.caseSensitive);
    const normalizeWs = serverAnswerKeySnapshot.normalizeWhitespace !== false;
    const normalizeStr = (s: string) => {
      let res = String(s ?? '');
      if (normalizeWs) res = res.trim().replace(/\s+/g, ' ');
      if (!caseSensitive) res = res.toLowerCase();
      return res;
    };

    const blanksConfig: Array<{ blankIndex: number; acceptedAnswers: string[] }> =
      serverAnswerKeySnapshot.blanks || [];
    const singleAccepted: string[] =
      serverAnswerKeySnapshot.acceptedAnswers || [];

    if (blanksConfig.length > 0) {
      const studentBlanks: string[] = Array.isArray(answerPayload.blankAnswers)
        ? answerPayload.blankAnswers.map(String)
        : [
            String(
              answerPayload.blankAnswer ??
                answerPayload.textAnswer ??
                answerPayload.text ??
                ''
            ),
          ];

      let matchedCount = 0;
      for (let i = 0; i < blanksConfig.length; i++) {
        const studentVal = normalizeStr(studentBlanks[i] || '');
        const accepted = (blanksConfig[i].acceptedAnswers || []).map(normalizeStr);
        if (studentVal && accepted.includes(studentVal)) {
          matchedCount++;
        }
      }

      const isExact = matchedCount === blanksConfig.length;
      const ratio = partialCreditEnabled
        ? matchedCount / blanksConfig.length
        : isExact
        ? 1
        : 0;

      return {
        isCorrect: isExact,
        partialRatio: Math.round(ratio * 10000) / 10000,
        autoScore:
          ratio > 0
            ? Math.round(ratio * maxPts * 100) / 100
            : negPts > 0
            ? -negPts
            : 0,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    } else {
      const rawAns = Array.isArray(answerPayload.blankAnswers)
        ? answerPayload.blankAnswers[0]
        : answerPayload.blankAnswer ??
          answerPayload.textAnswer ??
          answerPayload.shortAnswerText ??
          answerPayload.text ??
          '';
      const normStudent = normalizeStr(String(rawAns));
      const normAccepted = singleAccepted.map(normalizeStr);
      const matched = normStudent.length > 0 && normAccepted.includes(normStudent);

      return {
        isCorrect: matched,
        partialRatio: matched ? 1 : 0,
        autoScore: matched ? maxPts : negPts > 0 ? -negPts : 0,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }
  }

  if (questionType === 'SHORT_ANSWER') {
    const rawStudent = String(
      answerPayload.shortAnswerText ??
        answerPayload.textAnswer ??
        answerPayload.blankAnswer ??
        answerPayload.text ??
        ''
    ).trim();
    const variants: string[] = serverAnswerKeySnapshot.acceptedVariants || [];
    const matchMode = serverAnswerKeySnapshot.matchMode || 'CASE_INSENSITIVE';
    const manualFallback = Boolean(serverAnswerKeySnapshot.manualReviewFallback);

    let matched = false;
    for (const v of variants) {
      const cleanV = String(v).trim();
      if (!cleanV) continue;
      if (matchMode === 'EXACT') {
        if (rawStudent === cleanV) {
          matched = true;
          break;
        }
      } else if (matchMode === 'CONTAINS') {
        if (rawStudent.toLowerCase().includes(cleanV.toLowerCase())) {
          matched = true;
          break;
        }
      } else {
        if (
          rawStudent.toLowerCase().replace(/\s+/g, ' ') ===
          cleanV.toLowerCase().replace(/\s+/g, ' ')
        ) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      return {
        isCorrect: true,
        partialRatio: 1,
        autoScore: maxPts,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    if (manualFallback && rawStudent.length > 0) {
      return {
        isCorrect: false,
        partialRatio: 0,
        autoScore: 0,
        requiresManualReview: true,
        gradingStatus: 'UNGRADED',
      };
    }

    return {
      isCorrect: false,
      partialRatio: 0,
      autoScore: negPts > 0 ? -negPts : 0,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  if (questionType === 'NUMERIC') {
    const rawNum = Number(
      answerPayload.numericAnswer ?? answerPayload.value ?? answerPayload.text
    );
    if (Number.isNaN(rawNum)) {
      return {
        isCorrect: false,
        partialRatio: 0,
        autoScore: negPts > 0 ? -negPts : 0,
        requiresManualReview: false,
        gradingStatus: 'AUTO_GRADED',
      };
    }

    const exactVal = Number(serverAnswerKeySnapshot.exactValue ?? 0);
    const tolerance = Math.abs(Number(serverAnswerKeySnapshot.tolerance ?? 0));
    const diff = Math.abs(rawNum - exactVal);
    const matched = diff <= tolerance + 1e-9;

    return {
      isCorrect: matched,
      partialRatio: matched ? 1 : 0,
      autoScore: matched ? maxPts : negPts > 0 ? -negPts : 0,
      requiresManualReview: false,
      gradingStatus: 'AUTO_GRADED',
    };
  }

  return {
    isCorrect: false,
    partialRatio: 0,
    autoScore: 0,
    requiresManualReview: true,
    gradingStatus: 'UNGRADED',
  };
}

/**
 * Calculates an essay question score from rubric criteria or direct numeric score on the server.
 */
export function calculateServerEssayQuestionScore(params: {
  questionMaxPoints: number;
  gradingMethod: 'DIRECT' | 'RUBRIC';
  rawScore?: number;
  rubricSnapshot?: any;
  criterionScores?: Array<{
    criterionId: string;
    score: number;
    feedback?: string;
  }>;
}): {
  finalScore: number;
  normalizedCriterionScores: Array<{
    criterionId: string;
    criterionName: string;
    score: number;
    maxScore: number;
    weight: number;
    weightedContribution: number;
    feedback: string;
  }>;
} {
  const {
    questionMaxPoints,
    gradingMethod,
    rawScore,
    rubricSnapshot,
    criterionScores = [],
  } = params;

  const qMax = Math.max(0, Number(questionMaxPoints || 10));

  if (
    gradingMethod === 'RUBRIC' &&
    rubricSnapshot &&
    Array.isArray(rubricSnapshot.criteria) &&
    rubricSnapshot.criteria.length > 0
  ) {
    let totalWeight = 0;
    let weightedRatioSum = 0;
    const normalized: Array<{
      criterionId: string;
      criterionName: string;
      score: number;
      maxScore: number;
      weight: number;
      weightedContribution: number;
      feedback: string;
    }> = [];

    for (const crit of rubricSnapshot.criteria) {
      const cMax = Math.max(1, Number(crit.maxScore || 25));
      const cWeight = Math.max(0, Number(crit.weight || 0));
      const submitted = criterionScores.find(
        (cs) => cs.criterionId === crit.id || cs.criterionId === crit.criterionName
      );
      const clampedScore = Math.max(
        0,
        Math.min(cMax, Number(submitted?.score ?? 0))
      );
      totalWeight += cWeight;
      const ratio = clampedScore / cMax;
      weightedRatioSum += ratio * cWeight;

      normalized.push({
        criterionId: crit.id || crit.criterionName,
        criterionName: crit.criterionName || 'Kriteria',
        score: clampedScore,
        maxScore: cMax,
        weight: cWeight,
        weightedContribution:
          Math.round(ratio * (cWeight / 100) * qMax * 100) / 100,
        feedback: submitted?.feedback || '',
      });
    }

    const overallRatio =
      totalWeight > 0 ? weightedRatioSum / totalWeight : 0;
    const finalScore = Math.max(
      0,
      Math.min(qMax, Math.round(overallRatio * qMax * 100) / 100)
    );

    return {
      finalScore,
      normalizedCriterionScores: normalized,
    };
  }

  const clampedDirect = Math.max(0, Math.min(qMax, Number(rawScore ?? 0)));
  return {
    finalScore: Math.round(clampedDirect * 100) / 100,
    normalizedCriterionScores: [],
  };
}
