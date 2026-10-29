// src/utils/bonusPolicy.ts
// Quản lý chính sách thưởng công thái học & năng suất theo từng doanh nghiệp

export interface BonusTier {
  minScore: number;       // Điểm tối thiểu (VD: 90)
  maxScore: number;       // Điểm tối đa (VD: 100)
  tierName: string;       // Tên bậc: 'Xuất Sắc (Thưởng 100%)', 'Tốt (Thưởng 80%)'
  rewardRate: number;     // Tỷ lệ % của mức thưởng tối đa (VD: 100, 80, 50, 0)
  description?: string;
}

export interface CompanyBonusPolicy {
  companyName: string;                 // Tên công ty/doanh nghiệp
  cycle: 'daily' | 'weekly' | 'monthly'; // Chu kỳ xét thưởng
  maxRewardAmount: number;             // Mức thưởng tối đa chu kỳ (VNĐ), vd: 500.000
  currency: string;                    // Mặc định 'VNĐ'
  minScoreToReward: number;            // Điểm OHPS sàn để nhận thưởng (mặc định: 70)
  tiers: BonusTier[];                  // Các bậc phân loại thưởng
  specialBonuses: {
    perfectPostureBonus: number;       // Thưởng nóng khi tư thế chuẩn >= 90% (VNĐ)
    fullBreakBonus: number;            // Thưởng nóng khi hoàn thành 100% phiên đứng/giải lao (VNĐ)
    taskCompletedBonus: number;        // Thưởng nóng khi hoàn thành 100% nhiệm vụ giao (VNĐ)
  };
  notes?: string;                      // Thể lệ / ghi chú nội bộ công ty
  updatedAt?: string;
}

export interface BonusCalculationResult {
  baseReward: number;          // Tiền thưởng theo bậc điểm OHPS (VNĐ)
  postureBonus: number;        // Thưởng thêm tư thế chuẩn (VNĐ)
  breakBonus: number;          // Thưởng thêm giải lao/đứng (VNĐ)
  taskBonus: number;           // Thưởng thêm hoàn thành nhiệm vụ (VNĐ)
  totalReward: number;         // Tổng số tiền thưởng thực tế nhận được (VNĐ)
  achievementRate: number;     // Tỷ lệ % so với mức thưởng tối đa
  tierAchieved: BonusTier | null; // Bậc đạt được
  isEligible: boolean;         // Có đủ điều kiện nhận thưởng (điểm >= minScoreToReward)
  tipsToReachNextTier: string; // Hướng dẫn hành động cụ thể để tăng tiền thưởng
}

export const DEFAULT_BONUS_POLICY: CompanyBonusPolicy = {
  companyName: 'Công ty Cổ phần Công nghệ ABC',
  cycle: 'weekly',
  maxRewardAmount: 500000, // 500.000 VNĐ / tuần
  currency: 'VNĐ',
  minScoreToReward: 70,
  tiers: [
    {
      minScore: 90,
      maxScore: 100,
      tierName: 'Bậc 1: Xuất Sắc (100% Thưởng)',
      rewardRate: 100,
      description: 'Duy trì tư thế công thái học hoàn hảo và tiến độ công việc vượt trội'
    },
    {
      minScore: 80,
      maxScore: 89,
      tierName: 'Bậc 2: Tốt (80% Thưởng)',
      rewardRate: 80,
      description: 'Ý thức giữ gìn tư thế và thói quen giải lao tích cực'
    },
    {
      minScore: 70,
      maxScore: 79,
      tierName: 'Bậc 3: Khá (50% Thưởng)',
      rewardRate: 50,
      description: 'Đạt chuẩn công thái học cơ bản của công ty'
    },
    {
      minScore: 0,
      maxScore: 69,
      tierName: 'Chưa Đạt Chuẩn (0% Thưởng)',
      rewardRate: 0,
      description: 'Cần cải thiện tư thế ngồi và thói quen vận động để nhận thưởng'
    }
  ],
  specialBonuses: {
    perfectPostureBonus: 50000,  // +50.000 VNĐ nếu điểm tư thế ngồi >= 90
    fullBreakBonus: 30000,       // +30.000 VNĐ nếu điểm giải lao & đứng >= 90
    taskCompletedBonus: 50000    // +50.000 VNĐ nếu hoàn thành 100% công việc
  },
  notes: 'Chính sách thưởng khuyến khích chăm sóc sức khỏe cột sống & nâng cao hiệu suất làm việc văn phòng.',
  updatedAt: new Date().toISOString()
};

const BONUS_POLICY_STORAGE_KEY = 'theodoisk_company_bonus_policy';

/**
 * Đọc chính sách thưởng của công ty từ LocalStorage
 */
export function loadCompanyBonusPolicy(): CompanyBonusPolicy {
  try {
    const raw = localStorage.getItem(BONUS_POLICY_STORAGE_KEY);
    if (!raw) return DEFAULT_BONUS_POLICY;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_BONUS_POLICY,
      ...parsed,
      tiers: Array.isArray(parsed.tiers) && parsed.tiers.length > 0 ? parsed.tiers : DEFAULT_BONUS_POLICY.tiers,
      specialBonuses: {
        ...DEFAULT_BONUS_POLICY.specialBonuses,
        ...(parsed.specialBonuses || {})
      }
    };
  } catch (e) {
    console.warn('Lỗi đọc chính sách thưởng từ localStorage, dùng mặc định:', e);
    return DEFAULT_BONUS_POLICY;
  }
}

/**
 * Lưu chính sách thưởng của công ty
 */
export function saveCompanyBonusPolicy(policy: CompanyBonusPolicy): void {
  try {
    const updated = {
      ...policy,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(BONUS_POLICY_STORAGE_KEY, JSON.stringify(updated));
    // Phát event đồng bộ cho các component đang mở
    window.dispatchEvent(new CustomEvent('company_bonus_policy_updated', { detail: updated }));
  } catch (e) {
    console.error('Lỗi lưu chính sách thưởng vào localStorage:', e);
  }
}

/**
 * Định dạng tiền tệ VNĐ chuẩn hiển thị
 */
export function formatCurrencyVND(amount: number): string {
  const safeAmount = Math.max(0, Math.round(amount || 0));
  return `${new Intl.NumberFormat('vi-VN').format(safeAmount)} VNĐ`;
}

/**
 * Tính toán mức thưởng thực tế của nhân viên dựa trên điểm số OHPS và 4 trụ cột
 */
export function calculateEmployeeBonus(
  ohpsScore: number,
  breakdown: {
    S_posture: number;
    S_break: number;
    S_vital: number;
    S_task: number;
  },
  policy: CompanyBonusPolicy = DEFAULT_BONUS_POLICY,
  hasActualData: boolean = true
): BonusCalculationResult {
  const safeScore = Math.min(100, Math.max(0, Math.round(ohpsScore || 0)));
  if (!hasActualData || safeScore === 0) {
    return {
      baseReward: 0,
      postureBonus: 0,
      breakBonus: 0,
      taskBonus: 0,
      totalReward: 0,
      achievementRate: 0,
      tierAchieved: null,
      isEligible: false,
      tipsToReachNextTier: 'Bắt đầu ca làm việc tại trạm IoT để ghi nhận dữ liệu đo đạc thực tế và tính điểm thưởng.'
    };
  }
  const isEligible = safeScore >= (policy.minScoreToReward || 70);

  // Tìm bậc thưởng phù hợp
  let matchedTier: BonusTier | null = null;
  const sortedTiers = [...policy.tiers].sort((a, b) => b.minScore - a.minScore);
  for (const tier of sortedTiers) {
    if (safeScore >= tier.minScore && safeScore <= (tier.maxScore || 100)) {
      matchedTier = tier;
      break;
    }
  }

  // Tiền thưởng cơ bản theo bậc
  let baseReward = 0;
  if (matchedTier && isEligible) {
    baseReward = Math.round((policy.maxRewardAmount * (matchedTier.rewardRate / 100)));
  }

  // Thưởng nóng đặc biệt
  let postureBonus = 0;
  if (breakdown.S_posture >= 90 && (policy.specialBonuses?.perfectPostureBonus || 0) > 0) {
    postureBonus = policy.specialBonuses.perfectPostureBonus;
  }

  let breakBonus = 0;
  if (breakdown.S_break >= 90 && (policy.specialBonuses?.fullBreakBonus || 0) > 0) {
    breakBonus = policy.specialBonuses.fullBreakBonus;
  }

  let taskBonus = 0;
  if (breakdown.S_task >= 100 && (policy.specialBonuses?.taskCompletedBonus || 0) > 0) {
    taskBonus = policy.specialBonuses.taskCompletedBonus;
  }

  const totalReward = baseReward + postureBonus + breakBonus + taskBonus;
  const achievementRate = policy.maxRewardAmount > 0 
    ? Math.min(150, Math.round((totalReward / policy.maxRewardAmount) * 100)) 
    : 0;

  // Lời khuyên cụ thể để lên bậc tiếp theo
  let tipsToReachNextTier = '';
  if (!isEligible) {
    const pointsNeeded = policy.minScoreToReward - safeScore;
    tipsToReachNextTier = `Bạn đang thiếu ${pointsNeeded} điểm để đạt mốc nhận thưởng tối thiểu (${policy.minScoreToReward}đ). Hãy điều chỉnh tư thế ngồi thẳng lưng và thực hiện thêm các chu kỳ đứng giải lao.`;
  } else if (matchedTier && matchedTier.minScore < 90) {
    const nextTier = sortedTiers.find(t => t.minScore > (matchedTier?.minScore || 0));
    if (nextTier) {
      const pointsNeeded = nextTier.minScore - safeScore;
      const suggestions: string[] = [];
      if (breakdown.S_posture < 85) suggestions.push('nâng cao tỷ lệ ngồi thẳng lưng');
      if (breakdown.S_break < 80) suggestions.push('tăng số lần đứng dậy giải lao (mục tiêu 4 lần/ca)');
      if (breakdown.S_task < 100) suggestions.push('hoàn thành hết các nhiệm vụ được giao');

      tipsToReachNextTier = `Chỉ cần thêm ${pointsNeeded} điểm để lên ${nextTier.tierName}. Hãy ${suggestions.join(' và ')}.`;
    } else {
      tipsToReachNextTier = 'Bạn đang duy trì điểm thưởng rất tốt. Hãy tiếp tục giữ thói quen công thái học này!';
    }
  } else {
    tipsToReachNextTier = 'Xuất sắc! Bạn đã đạt mức thưởng cao nhất của công ty trong kỳ này.';
  }

  return {
    baseReward,
    postureBonus,
    breakBonus,
    taskBonus,
    totalReward,
    achievementRate,
    tierAchieved: matchedTier,
    isEligible,
    tipsToReachNextTier
  };
}
