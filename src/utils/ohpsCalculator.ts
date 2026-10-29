// src/utils/ohpsCalculator.ts

export interface RawTelemetryLog {
  id?: number | string;
  created_at: string;
  user_id: string;
  bpm: number;
  spo2: number;
  posture_status?: number;
  posture_label: string; // "Đúng", "Tư thế ĐÚNG (Chuẩn)", "Sai tư thế", "Vắng mặt / Rời ghế..."
}

export interface TaskItem {
  id: string;
  status: 'pending' | 'acknowledged' | 'completed';
  assigned_to: string;
  assigned_by?: string;
  is_personal?: boolean;
}

export interface OHPSCalculationResult {
  hesScore: number;         // Health & Ergonomics Score (0-100)
  taskScore: number;        // Task Score (0-100)
  ohpsScore: number;        // Điểm tổng OHPS (0-100)
  dataConfidence: number;   // % Độ tin cậy dữ liệu (0-100%)
  hasVitalData: boolean;    // Cờ báo có dữ liệu cảm biến sinh hiệu hay không
  hasActualData: boolean;   // Cờ báo có dữ liệu đo đạc thực tế hay không
  evaluation: {
    level: string;
    badgeColor: string;
    meaning: string;
  };
  breakdown: {
    S_posture: number; // Điểm tư thế (0-100)
    S_break: number;   // Điểm giải lao (0-100)
    S_vital: number;   // Điểm sinh hiệu (0-100 hoặc -1 nếu mất cảm biến)
    S_task: number;    // Điểm task (0-100)
  };
}

export function getOHPSEvaluation(score: number): { level: string; badgeColor: string; meaning: string } {
  if (score >= 90) {
    return {
      level: 'Rất tốt',
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      meaning: 'Duy trì tốt hành vi làm việc lành mạnh và tiến độ công việc chuẩn.'
    };
  } else if (score >= 80) {
    return {
      level: 'Tốt',
      badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
      meaning: 'Hoạt động công thái học ổn định, năng suất cao.'
    };
  } else if (score >= 70) {
    return {
      level: 'Khá',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
      meaning: 'Có một số hành vi tư thế hoặc thói quen cần lưu ý cải thiện.'
    };
  } else if (score >= 60) {
    return {
      level: 'Cần cải thiện',
      badgeColor: 'bg-orange-50 text-orange-800 border-orange-200',
      meaning: 'Nhiều yếu tố tư thế chưa đạt, cần đứng dậy giải lao và điều chỉnh lưng.'
    };
  }
  return {
    level: 'Cần chú ý',
    badgeColor: 'bg-rose-50 text-rose-800 border-rose-200',
    meaning: 'Cảnh báo nguy cơ mỏi cơ cột sống hoặc tiến độ công việc chậm.'
  };
}

/**
 * Chuyển đổi một bản ghi từ bảng daily_ohps_summary trên Supabase thành đối tượng OHPSCalculationResult
 */
export function mapSupabaseRowToOHPSResult(row: any): OHPSCalculationResult {
  const ohpsScore = Number(row.ohps_score ?? 0);
  const hesScore = Number(row.hes_score ?? 0);
  const taskScore = Number(row.ts_score ?? row.task_score ?? 0);
  const hasVitalData = row.has_vital_data !== undefined ? Boolean(row.has_vital_data) : Number(row.vital_score) !== -1;
  const dataConfidence = Number(row.data_confidence ?? 0);
  const hasActualData = (dataConfidence > 0 || ohpsScore > 0 || hesScore > 0) && row.posture_score !== undefined;

  return {
    hesScore,
    taskScore,
    ohpsScore,
    dataConfidence,
    hasVitalData,
    hasActualData,
    evaluation: hasActualData ? getOHPSEvaluation(ohpsScore) : {
      level: 'Chưa có dữ liệu',
      badgeColor: 'bg-slate-100 text-slate-500 border-slate-200',
      meaning: 'Chưa có bản ghi đo đạc thực tế từ trạm IoT trong ca làm việc.'
    },
    breakdown: {
      S_posture: Number(row.posture_score ?? 0),
      S_break: Number(row.break_score ?? 0),
      S_vital: Number(row.vital_score ?? -1),
      S_task: Number(row.task_score ?? 0)
    }
  };
}

/**
 * Hàm phân tích và tính toán điểm OHPS từ dữ liệu nhật ký Supabase (telemetry_logs) và Task
 * - Với nhân viên thường: Tính theo task do Admin giao (assigned_by !== currentUserId và !is_personal)
 * - Với Admin: Tính theo task cá nhân tự thêm (is_personal || assigned_by === currentUserId)
 */
export function calculateOHPSFromLogs(
  logs: RawTelemetryLog[],
  tasks: TaskItem[],
  requiredBreaksCount: number = 4, // Số lần cần đứng dậy giải lao trong ngày (mặc định 4 lần)
  completedBreaksCount: number = 4,
  expectedLogsCount: number = 100, // Số lượng log kỳ vọng trong 1 ca làm việc
  userRole: 'admin' | 'employee' = 'employee',
  currentUserId?: string
): OHPSCalculationResult {
  
  // 1. TÍNH ĐIỂM TƯ THẾ NGỒI CHUẨN (S_posture - Trọng số 35%)
  // Tách biệt hoàn toàn Ngồi và Đứng:
  // - Vắng mặt (status = 2 hoặc label 'vắng', 'rời ghế') bị loại bỏ
  // - Đứng (status = 5 hoặc label 'đứng', 'standing') là hoạt động đứng/giải lao, KHÔNG tính vào tư thế ngồi chuẩn
  const sittingLogs = logs.filter(l => {
    if (l.posture_status === 2 || l.posture_status === 5) return false;
    const label = (l.posture_label || '').toLowerCase();
    if (label.includes('vắng') || label.includes('ngoài vùng') || label.includes('rời ghế') || label.includes('đứng') || label.includes('standing')) {
      return false;
    }
    return true;
  });

  // Trong các log ngồi làm việc, chỉ các log ngồi đúng/chuẩn lưng thẳng mới được tính điểm
  const goodSittingLogs = sittingLogs.filter(l => {
    if (l.posture_status === 0) return true;
    const label = (l.posture_label || '').toLowerCase();
    const isBad = label.includes('sai') || label.includes('cúi') || label.includes('nghiêng') || label.includes('ngả') || label.includes('gù') || label.includes('lệch');
    return !isBad && (label.includes('đúng') || label.includes('chuẩn') || label.includes('thẳng'));
  });
  
  // Điểm tư thế ngồi: tỷ lệ thời gian ngồi chuẩn trên tổng thời gian ngồi
  // Nếu chưa có log ngồi nào trong phiên (mới vào hoặc chỉ đứng), cho 100đ
  const S_posture = sittingLogs.length > 0 
    ? Math.min(100, Math.max(0, Math.round((goodSittingLogs.length / sittingLogs.length) * 100))) 
    : 100;

  // 2. TÍNH ĐIỂM GIẢI LAO & ĐỨNG (S_break - Trọng số 20%)
  // Tính trung thực theo số chu kỳ đứng giải lao đã hoàn thành / số chu kỳ yêu cầu
  // Không ép cứng 25 điểm khi chưa đứng lần nào
  const safeRequiredBreaks = Math.max(1, requiredBreaksCount);
  const safeCompletedBreaks = Math.max(0, completedBreaksCount);
  const S_break = Math.min(100, Math.max(0, Math.round((safeCompletedBreaks / safeRequiredBreaks) * 100)));

  // 3. TÍNH ĐIỂM SINH HIỆU (S_vital - Trọng số 15%) & KIỂM TRA MẤT CẢM BIẾN
  const validVitalLogs = logs.filter(l => l.bpm > 0 && l.spo2 > 0);
  const hasVitalData = validVitalLogs.length > 0;

  let S_vital = -1;
  if (hasVitalData) {
    const avgBpm = validVitalLogs.reduce((acc, l) => acc + l.bpm, 0) / validVitalLogs.length;
    const avgSpo2 = validVitalLogs.reduce((acc, l) => acc + l.spo2, 0) / validVitalLogs.length;

    const S_HR = (avgBpm >= 60 && avgBpm <= 100) ? 100 : (avgBpm > 0 ? 60 : 0);
    const S_SpO2 = avgSpo2 >= 95 ? 100 : (avgSpo2 >= 90 ? 70 : 40);
    const S_SQI = 90; // Mặc định độ ổn định tín hiệu 90%

    S_vital = Math.min(100, Math.max(0, Math.round((0.5 * S_HR) + (0.3 * S_SpO2) + (0.2 * S_SQI))));
  }

  // 4. TÍNH ĐIỂM TIẾN ĐỘ CÔNG VIỆC (S_task - Trọng số 30%)
  // Quy tắc chuẩn:
  // - Nhân viên: Tính theo task mà Admin giao (loại trừ task cá nhân tự thêm)
  // - Admin: Tính theo task tự thêm
  const relevantTasks = tasks.filter(t => {
    if (userRole === 'admin') {
      // Admin: tính theo task tự thêm
      return Boolean(t.is_personal || t.assigned_by === currentUserId || t.assigned_to === currentUserId);
    } else {
      // Nhân viên: tính theo task do Admin giao (bỏ qua task tự thêm cá nhân)
      if (t.is_personal === true) return false;
      if (currentUserId && t.assigned_by === currentUserId && t.assigned_to === currentUserId) return false;
      return true;
    }
  });

  const assignedTasks = relevantTasks.length;
  const completedTasks = relevantTasks.filter(t => t.status === 'completed').length;
  
  const S_task = assignedTasks > 0 
    ? Math.min(100, Math.max(0, Math.round((completedTasks / assignedTasks) * 100))) 
    : 100; // Mặc định 100 nếu chưa có task tương ứng

  // 5. TÍNH ĐIỂM HES (Sức khỏe & Công thái học - Tổng 70%)
  // Phân bổ lại trọng số nếu mất cảm biến sinh hiệu
  let hesScore = 0;
  if (hasVitalData && S_vital >= 0) {
    hesScore = Math.min(100, Math.max(0, Math.round((35 * S_posture + 20 * S_break + 15 * S_vital) / 70)));
  } else {
    hesScore = Math.min(100, Math.max(0, Math.round((35 * S_posture + 20 * S_break) / 55)));
  }

  // 6. TÍNH ĐIỂM OHPS TỔNG HỢP (70% HES + 30% TS)
  const ohpsScore = Math.min(100, Math.max(0, Math.round(0.70 * hesScore + 0.30 * S_task)));

  // 7. ĐỘ TIN CẬY DỮ LIỆU (Data Confidence)
  const logRatio = expectedLogsCount > 0 ? Math.min(1, logs.length / expectedLogsCount) : 1;
  const dataConfidence = Math.min(100, Math.max(0, Math.round((logRatio * 0.7 + (hasVitalData ? 0.3 : 0)) * 100)));

  return {
    hesScore,
    taskScore: S_task,
    ohpsScore,
    dataConfidence,
    hasVitalData,
    hasActualData: true,
    evaluation: getOHPSEvaluation(ohpsScore),
    breakdown: {
      S_posture,
      S_break,
      S_vital,
      S_task
    }
  };
}