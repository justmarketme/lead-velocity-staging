export interface OnboardingData {
    crmUsage: 'full' | 'basic' | 'none';
    speedToContact: '5min' | '30min' | 'sameDay' | 'nextDay';
    teamSize: 'solo' | 'small' | 'dedicated' | 'unclear';
    followUpClarity: 'clear' | 'basic' | 'none';
    monthlySpend: 'under5k' | '5k-15k' | '15k-30k' | '30k+' | 'none';
    cplAwareness: 'yes' | 'rough' | 'no';
    pricingComfort: 'comfortable' | 'flexible' | 'sensitive';
    desiredLeadsWeekly: number;
    maxCapacityWeekly: number;
    productFocusClarity: 'clear' | 'multiple' | 'unclear';
    geographicFocusClarity: 'clear' | 'semi' | 'undefined';
    growthGoalClarity: 'numeric' | 'general' | 'vague';
    timeline: 'immediate' | '30days' | 'exploring';
}

export interface AnalysisResult {
    operationalScore: number;
    budgetScore: number;
    growthScore: number;
    intentScore: number;
    successProbability: number;
    riskFlags: string[];
    successBand: 'High' | 'Medium' | 'Low';
    primarySalesAngle: string;
}

export const calculateScores = (data: OnboardingData): AnalysisResult => {
    const flags: string[] = [];

    // 1. Operational Readiness Score (Max 100)
    let opScore = 0;
    if (data.crmUsage === 'full') opScore += 30;
    else if (data.crmUsage === 'basic') opScore += 15;

    if (data.speedToContact === '5min') opScore += 30;
    else if (data.speedToContact === '30min') opScore += 20;
    else if (data.speedToContact === 'sameDay') opScore += 10;

    if (data.teamSize === 'dedicated') opScore += 20;
    else if (data.teamSize === 'small') opScore += 15;
    else if (data.teamSize === 'solo') opScore += 10;
    else opScore += 5;

    if (data.followUpClarity === 'clear') opScore += 20;
    else if (data.followUpClarity === 'basic') opScore += 10;

    if (opScore < 60) flags.push('Operational Risk');
    if (opScore < 40) flags.push('High Churn Risk');

    // 2. Budget Alignment Score (Max 100)
    let budgetScore = 0;
    if (data.monthlySpend === '30k+') budgetScore += 30;
    else if (data.monthlySpend === '15k-30k') budgetScore += 25;
    else if (data.monthlySpend === '5k-15k') budgetScore += 15;
    else if (data.monthlySpend === 'under5k') budgetScore += 5;

    if (data.cplAwareness === 'yes') budgetScore += 25;
    else if (data.cplAwareness === 'rough') budgetScore += 15;
    else budgetScore += 5;

    // Volume vs capacity
    if (data.desiredLeadsWeekly <= data.maxCapacityWeekly) {
        budgetScore += 30;
    } else if (data.desiredLeadsWeekly <= data.maxCapacityWeekly * 1.5) {
        budgetScore += 15;
        flags.push('Expectation Mismatch');
    } else {
        flags.push('Expectation Mismatch');
    }

    if (data.pricingComfort === 'comfortable') budgetScore += 15;
    else if (data.pricingComfort === 'flexible') budgetScore += 10;

    if (budgetScore < 60) flags.push('Price Sensitivity Risk');

    // 3. Growth Viability Score (Max 100)
    let growthScore = 0;
    if (data.productFocusClarity === 'clear') growthScore += 30;
    else if (data.productFocusClarity === 'multiple') growthScore += 20;
    else growthScore += 10;

    if (data.geographicFocusClarity === 'clear') growthScore += 25;
    else if (data.geographicFocusClarity === 'semi') growthScore += 15;
    else growthScore += 5;

    if (data.growthGoalClarity === 'numeric') growthScore += 25;
    else if (data.growthGoalClarity === 'general') growthScore += 15;
    else {
        growthScore += 5;
        flags.push('Strategy Required');
    }

    if (data.timeline === 'immediate') growthScore += 20;
    else if (data.timeline === '30days') growthScore += 15;
    else growthScore += 5;

    if (growthScore < 60) flags.push('Low Growth Readiness');

    // 4. Intent Score (Internal simple calculation for the 15% weight)
    // Since requirements don't explicitly show a separate intent breakdown but add it to composite,
    // we derive it from timeline and goals which are parts of Growth in the spec but weighted separately in composite.
    // We'll normalize the scores for the weighted composite.

    // Composite Score Weighting
    // Operational Readiness = 35%
    // Budget Alignment = 25%
    // Growth Viability = 25%
    // Intent/Timeline = 15% (Derived from timeline and growth goal clarity)

    let intentScore = 0;
    if (data.timeline === 'immediate') intentScore += 60;
    else if (data.timeline === '30days') intentScore += 40;
    else intentScore += 20;

    if (data.growthGoalClarity === 'numeric') intentScore += 40;
    else if (data.growthGoalClarity === 'general') intentScore += 20;

    const compositeScore = Math.round(
        (opScore * 0.35) +
        (budgetScore * 0.25) +
        (growthScore * 0.25) +
        (intentScore * 0.15)
    );

    let successBand: 'High' | 'Medium' | 'Low' = 'Low';
    if (compositeScore >= 80) successBand = 'High';
    else if (compositeScore >= 60) successBand = 'Medium';

    // Sales Angle Assignment
    let angle = 'Education & Setup';
    if (budgetScore < 50) angle = 'Cost Efficiency';
    else if (opScore < 50) angle = 'Process Optimisation';
    else if (budgetScore >= 80 && data.desiredLeadsWeekly > 50) angle = 'Volume Scaling';
    else if (opScore >= 80) angle = 'Lead Quality';

    return {
        operationalScore: opScore,
        budgetScore: budgetScore,
        growthScore: growthScore,
        intentScore: intentScore,
        successProbability: compositeScore,
        riskFlags: Array.from(new Set(flags)),
        successBand,
        primarySalesAngle: angle
    };
};
