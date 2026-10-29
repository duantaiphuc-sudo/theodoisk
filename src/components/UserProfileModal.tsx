import React, { useState, useEffect } from 'react';
import { AuthUser } from '../types';
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  Shield, 
  Activity, 
  Calendar, 
  Clock, 
  Heart, 
  Weight, 
  Ruler, 
  Building, 
  FileText, 
  CheckCircle2, 
  Users, 
  Radio,
  Save,
  Stethoscope,
  Sparkles,
  AlertTriangle,
  Info
} from 'lucide-react';
import { syncUserProfileToFirestore, saveCurrentUser } from '../services/authService';
import { COMMON_MEDICAL_CONDITIONS, calculateAdaptiveThresholds } from '../utils/adaptiveThresholds';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  onUpdateUser: (updated: AuthUser) => void;
  onOpenUserManagement?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onOpenUserManagement,
}) => {
  const [formData, setFormData] = useState<AuthUser>({ ...currentUser });
  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    currentUser.medicalConditions || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setFormData({ ...currentUser });
    setSelectedConditions(currentUser.medicalConditions || []);
  }, [currentUser, isOpen]);

  // Ngưỡng đo y tế thích ứng theo giới tính, tuổi, và bệnh nền
  const adaptiveResult = React.useMemo(() => {
    return calculateAdaptiveThresholds({
      ...formData,
      medicalConditions: selectedConditions,
    });
  }, [formData.gender, formData.age, formData.height, formData.weight, formData.healthNotes, selectedConditions]);

  if (!isOpen) return null;

  // Calculate BMI index
  const heightM = (formData.height || 170) / 100;
  const weightKg = formData.weight || 65;
  const bmi = heightM > 0 ? (weightKg / (heightM * heightM)).toFixed(1) : '22.0';
  const bmiNum = parseFloat(bmi);

  let bmiCategory = { label: 'Bình thường, cân đối', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (bmiNum < 18.5) {
    bmiCategory = { label: 'Hơi nhẹ cân', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  } else if (bmiNum >= 25 && bmiNum < 30) {
    bmiCategory = { label: 'Hơi thừa cân', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  } else if (bmiNum >= 30) {
    bmiCategory = { label: 'Béo phì, cần vận động nhiều hơn', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AuthUser = {
        ...formData,
        age: Number(formData.age) || 28,
        height: Number(formData.height) || 170,
        weight: Number(formData.weight) || 65,
        maxSittingHours: Number(formData.maxSittingHours) || 6,
        medicalConditions: selectedConditions,
      };

      // Save locally & to Firestore
      saveCurrentUser(updated);
      await syncUserProfileToFirestore(updated);
      onUpdateUser(updated);

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Lỗi lưu thông tin hồ sơ:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const isAdmin = formData.role === 'admin' || formData.role === 'manager';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 leading-tight truncate">
                Hồ Sơ Sức Khỏe & Tài Khoản Cá Nhân
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Cài đặt chỉ số thể trạng, độ tuổi, và mục tiêu công thái học IoT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Top Profile Summary Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50/70 via-indigo-50/40 to-slate-50 border border-sky-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {formData.avatar ? (
                <div className="relative group shrink-0">
                  <img 
                    src={formData.avatar} 
                    alt="avatar" 
                    className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm"
                    referrerPolicy="no-referrer" 
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, avatar: '' }))}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xs transition cursor-pointer"
                    title="Xóa ảnh này khỏi ảnh đại diện (Dùng chữ cái viết tắt mặc định)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-14 h-14 rounded-full bg-sky-600 text-white font-bold text-xl flex items-center justify-center shadow-sm shrink-0">
                  {formData.fullName?.charAt(0) || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {formData.fullName || 'Chưa đặt tên'}
                  </h4>
                  {formData.avatar && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, avatar: '' }))}
                      className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      (Xóa ảnh đại diện)
                    </button>
                  )}
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    isAdmin 
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    <Shield className="w-3 h-3 text-indigo-600" />
                    <span>{isAdmin ? 'Quản Trị Viên (Admin)' : 'Nhân Viên Theo Dõi'}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{formData.email}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  Mã tài khoản: {formData.id}
                </p>
              </div>
            </div>

            {/* Quick Link to Admin Management if Admin */}
            {isAdmin && onOpenUserManagement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenUserManagement();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Quản lý tất cả tài khoản</span>
              </button>
            )}
          </div>

          {/* Health Index Card (BMI & Recommendation) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                <span>Chỉ Số Thể Trạng BMI (Body Mass Index)</span>
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${bmiCategory.color}`}>
                BMI: {bmi} — {bmiCategory.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Hệ thống IoT Raspberry Pi 4 sử dụng các chỉ số chiều cao, cân nặng và độ tuổi này để tự động tinh chỉnh góc phát hiện tư thế gù lưng và tính toán nhịp tim tối ưu.
            </p>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Họ và Tên</span>
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition"
                placeholder="Nguyễn Văn A"
              />
            </div>

            {/* Email (Readonly) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>Địa chỉ Email</span>
              </label>
              <input
                type="email"
                disabled
                value={formData.email}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
              />
            </div>

            {/* Age (Độ tuổi) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span>Độ Tuổi (Tuổi)</span>
                <span className="text-[10px] text-sky-600 font-semibold">*Bắt buộc</span>
              </label>
              <input
                type="number"
                min="10"
                max="100"
                required
                value={formData.age || ''}
                onChange={e => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition font-mono font-semibold text-slate-900"
                placeholder="Ví dụ: 27"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Giới Tính</span>
              </label>
              <select
                value={formData.gender || 'male'}
                onChange={e => setFormData({ ...formData, gender: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition cursor-pointer"
              >
                <option value="male">Nam (Male)</option>
                <option value="female">Nữ (Female)</option>
                <option value="other">Khác (Other)</option>
              </select>
            </div>

            {/* Height (Chiều cao cm) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chiều Cao (cm)</span>
              </label>
              <input
                type="number"
                min="100"
                max="250"
                value={formData.height || ''}
                onChange={e => setFormData({ ...formData, height: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition font-mono font-semibold text-slate-900"
                placeholder="Ví dụ: 172"
              />
            </div>

            {/* Weight (Cân nặng kg) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Weight className="w-3.5 h-3.5 text-emerald-600" />
                <span>Cân Nặng (kg)</span>
              </label>
              <input
                type="number"
                min="30"
                max="200"
                value={formData.weight || ''}
                onChange={e => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition font-mono font-semibold text-slate-900"
                placeholder="Ví dụ: 65"
              />
            </div>

            {/* Department / Job */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                <span>Phòng Ban / Vị Trí Làm Việc</span>
              </label>
              <input
                type="text"
                value={formData.department || ''}
                onChange={e => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition"
                placeholder="Ví dụ: Kỹ thuật IoT / Lập trình viên"
              />
            </div>

            {/* Max Sitting Hours */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Mục Tiêu Giới Hạn Ngồi Tối Đa (Giờ/Ngày)</span>
              </label>
              <input
                type="number"
                min="1"
                max="16"
                value={formData.maxSittingHours || 6}
                onChange={e => setFormData({ ...formData, maxSittingHours: parseFloat(e.target.value) || 6 })}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition font-mono font-semibold text-slate-900"
                placeholder="Ví dụ: 6"
              />
            </div>
          </div>

          {/* IoT Device Pairing Display */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-600" />
                <span>Thiết Bị Đo Ghép Cặp (DeviceId):</span>
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ghép cặp phần cứng Raspberry Pi 4 với tài khoản của bạn để bảo mật theo quy tắc Firestore.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-white text-indigo-700 border border-slate-200 shadow-2xs shrink-0 self-start sm:self-auto">
              {formData.deviceId || formData.device || '– Chưa được gán'}
            </span>
          </div>

          {/* Medical Conditions Selector & Adaptive Thresholds */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Stethoscope className="w-4 h-4 text-rose-500" />
                <span>Tiền Sử Bệnh Nền & Thể Trạng Đặc Thù</span>
              </label>
              <span className="text-[11px] font-medium text-slate-500">
                (Hệ thống tự động điều chỉnh ngưỡng cảnh báo)
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Chọn các tình trạng sức khỏe bạn đang gặp phải để AI và thiết bị IoT tự động cá nhân hóa chu kỳ ngồi và ngưỡng sinh hiệu tối ưu:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {COMMON_MEDICAL_CONDITIONS.map(cond => {
                const isSelected = selectedConditions.includes(cond.id);
                return (
                  <button
                    key={cond.id}
                    type="button"
                    onClick={() => {
                      setSelectedConditions(prev => 
                        isSelected ? prev.filter(c => c !== cond.id) : [...prev, cond.id]
                      );
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all flex items-start gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-50/80 border-rose-300 text-slate-900 shadow-2xs ring-1 ring-rose-200'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                      isSelected ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <span className="text-[10px] font-bold leading-none">✓</span>}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-xs font-bold truncate">{cond.name}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-1">{cond.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live Adaptive Threshold Preview Card */}
            <div className="mt-3 p-3.5 rounded-xl bg-white border border-sky-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-sky-900">
                    Ngưỡng Đo Y Tế Thích Ứng Tự Động (Adaptive Thresholds)
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${
                  adaptiveResult.riskLevel === 'high_attention'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : adaptiveResult.riskLevel === 'moderate'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {adaptiveResult.riskLevel === 'high_attention'
                    ? '⚠️ Cần giám sát đặc biệt'
                    : adaptiveResult.riskLevel === 'moderate'
                    ? '⚡ Đã tối ưu hóa thể trạng'
                    : '✓ Tiêu chuẩn lao động'}
                </span>
              </div>

              <p className="text-xs text-slate-600 font-medium leading-relaxed bg-sky-50/60 p-2 rounded-lg border border-sky-100">
                {adaptiveResult.clinicalSummary}
              </p>

              {/* 4 Metric Threshold Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Nhịp tim an toàn</span>
                  <span className="text-xs font-extrabold font-mono text-slate-800 mt-0.5 block">
                    {adaptiveResult.thresholds.hrMin} - {adaptiveResult.thresholds.hrMax} <span className="text-[9px] font-normal text-slate-500">BPM</span>
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">SpO₂ tối thiểu</span>
                  <span className="text-xs font-extrabold font-mono text-slate-800 mt-0.5 block">
                    ≥ {adaptiveResult.thresholds.spo2Min}%
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Ngồi liên tục tối đa</span>
                  <span className="text-xs font-extrabold font-mono text-indigo-700 mt-0.5 block">
                    {Math.round(adaptiveResult.thresholds.longSittingSec / 60)} phút
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">Độ nhạy cúi gù</span>
                  <span className="text-xs font-extrabold font-mono text-rose-700 mt-0.5 block">
                    Báo sau {adaptiveResult.thresholds.incorrectPostureSec}s
                  </span>
                </div>
              </div>

              {/* Clinical tips */}
              {adaptiveResult.personalizedTips.length > 0 && (
                <div className="text-[11px] text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                  {adaptiveResult.personalizedTips.map((tip, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-sky-600 font-bold shrink-0">•</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Health Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Ghi Chú Y Tế & Tiền Sử Sức Khỏe (Cột sống, tim mạch...)</span>
            </label>
            <textarea
              rows={3}
              value={formData.healthNotes || ''}
              onChange={e => setFormData({ ...formData, healthNotes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-500 focus:bg-white transition leading-relaxed"
              placeholder="Ví dụ: Tiền sử mỏi cổ vai gáy khi ngồi trên 1 tiếng, nhịp tim nghỉ ngơi khoảng 70-80 bpm..."
            />
          </div>

          {/* Success Toast */}
          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Đã lưu thành công thông tin hồ sơ lên Firebase Firestore & bộ nhớ thiết bị!</span>
            </div>
          )}
        </form>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 h-9 px-5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu lên Firebase...' : 'Lưu Thay Đổi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
