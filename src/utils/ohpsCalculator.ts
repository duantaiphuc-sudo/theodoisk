// src/utils/ohpsCalculator.ts

export interface RawTelemetryLog {
  id?: number;
  created_at: string;
  user_id: string;
  bpm: number;
  spo2: number;
  posture_status?: number;
  posture_label: string; // "Đúng", "Sai tư thế", "Vắng / Không..."
}

export interface TaskItem {
  id: string;
  status: 'pending' | 'completed';
  assigned_to: string;
}

export interface OHPSCalculationResult {
  hesScore: number;         // Health & Ergonomics Score (0-100)
  taskScore: number;        // Task Score (0-100)
  ohpsScore: number;        // Điểm tổng OHPS (0-100)
  dataConfidence: number;   // % Độ tin cậy dữ liệu (0-100%)
  hasVitalData: boolean;    // Cờ báo có dữ liệu cảm biến sinh hiệu hay không
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

/**
 * Hàm tính toán điểm OHPS dựa trên dữ liệu nhật ký Supabase & danh sách Task
 */
export function calculateOHPSFromLogs(
  logs: RawTelemetryLog[],
  tasks: TaskItem[],
  requiredBreaksCount: number = 4, // Số lần cần đứng dậy giải lao trong ngày (mặc định 4 lần)
  completedBreaksCount: number = 4,
  expectedLogsCount: number = 100  // Số lượng log kỳ vọng trong 1 ca làm việc
): OHPSCalculationResult {
  
  // 1. TÍNH ĐIỂM TƯ THẾ (S_posture - Trọng số 35%)
  // Lọc các log hợp lệ (người dùng đang ngồi trước camera, loại bỏ "Vắng / Không")
  const presentLogs = logs.filter(l => l.posture_label !== 'Vắng / Không' && l.posture_label !== 'Vắng');
  const goodPostureLogs = presentLogs.filter(l => l.posture_label === 'Đúng');
  
  const S_posture = presentLogs.length > 0 
    ? Math.min(100, Math.round((goodPostureLogs.length / presentLogs.length) * 100)) 
    : 100;

  // 2. TÍNH ĐIỂM GIẢI LAO (S_break - Trọng số 20%)
  const S_break = requiredBreaksCount > 0 
    ? Math.min(100, Math.round((completedBreaksCount / requiredBreaksCount) * 100)) 
    : 100;

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

    S_vital = Math.round((0.5 * S_HR) + (0.3 * S_SpO2) + (0.2 * S_SQI));
  }

  // 4. TÍNH ĐIỂM TIẾN ĐỘ CÔNG VIỆC (S_task - Trọng số 30%)
  const assignedTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  
  const S_task = assignedTasks > 0 
    ? Math.min(100, Math.round((completedTasks / assignedTasks) * 100)) 
    : 100; // Nếu sếp không giao task nào, mặc định 100 điểm

  // 5. TÍNH ĐIỂM HES (Sức khỏe & Công thái học - Tổng 70%)
  // RENORMALIZATION: Nếu mất cảm biến sinh hiệu, chia lại trên tổng 55% còn lại
  let hesScore = 0;
  if (hasVitalData) {
    hesScore = Math.round((35 * S_posture + 20 * S_break + 15 * S_vital) / 70);
  } else {
    hesScore = Math.round((35 * S_posture + 20 * S_break) / 55);
  }

  // 6. TÍNH ĐIỂM OHPS TỔNG HỢP (70% HES + 30% TS)
  const ohpsScore = Math.round(0.70 * hesScore + 0.30 * S_task);

  // 7. ĐỘ TIN CẬY DỮ LIỆU (Data Confidence)
  const logRatio = expectedLogsCount > 0 ? Math.min(1, logs.length / expectedLogsCount) : 1;
  const dataConfidence = Math.round((logRatio * 0.7 + (hasVitalData ? 0.3 : 0)) * 100);

  // 8. XẾP LOẠI TÍCH CỰC
  let evaluation = {
    level: 'Cần chú ý',
    badgeColor: 'bg-red-500/10 text-red-500 border-red-500/20',
    meaning: 'Nên xem lại các yếu tố sức khỏe, công thái học và tiến độ làm việc.'
  };

  if (ohpsScore >= 90) {
    evaluation = {
      level: 'Rất tốt',
      badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      meaning: 'Duy trì tốt hành vi làm việc lành mạnh và tiến độ công việc.'
    };
  } else if (ohpsScore >= 80) {
    evaluation = {
      level: 'Tốt',
      badgeColor: 'bg-green-500/10 text-green-500 border-green-500/20',
      meaning: 'Hoạt động ổn định, còn một số điểm cần cải thiện.'
    };
  } else if (ohpsScore >= 70) {
    evaluation = {
      level: 'Khá',
      badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      meaning: 'Có một số hành vi công thái học cần chú ý.'
    };
  } else if (ohpsScore >= 60) {
    evaluation = {
      level: 'Cần cải thiện',
      badgeColor: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      meaning: 'Có nhiều yếu tố chưa đạt, cần nghỉ ngơi và điều chỉnh tư thế.'
    };
  }

  return {
    hesScore,
    taskScore: S_task,
    ohpsScore,
    dataConfidence,
    hasVitalData,
    evaluation,
    breakdown: {
      S_posture,
      S_break,
      S_vital,
      S_task
    }
  };
}