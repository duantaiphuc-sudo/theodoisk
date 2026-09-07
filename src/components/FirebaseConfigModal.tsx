import React, { useState } from 'react';
import { X, Database, Check, AlertCircle, RefreshCw, Send, HelpCircle, Layers, ClipboardPaste, ExternalLink, Trash2 } from 'lucide-react';
import { FirebaseConnectionConfig } from '../types';
import { pushMockTelemetryToFirebase, clearFirebaseTelemetry } from '../services/firebase';

interface FirebaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FirebaseConnectionConfig;
  onSaveConfig: (newConfig: FirebaseConnectionConfig) => void;
  isConnected: boolean;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  isConnected,
}) => {
  const [formData, setFormData] = useState<FirebaseConnectionConfig>({ ...config });
  const [rawConfigText, setRawConfigText] = useState('');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [parseNotice, setParseNotice] = useState<string | null>(null);

  // Sync formData when modal opens or config changes
  React.useEffect(() => {
    if (isOpen) {
      setFormData({ ...config });
      setTestStatus(null);
      setParseNotice(null);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(formData);
    onClose();
  };

  const handleParseRawConfig = () => {
    if (!rawConfigText.trim()) return;
    try {
      // Extract apiKey
      const apiKeyMatch = rawConfigText.match(/apiKey:\s*["']([^"']+)["']/);
      const projectIdMatch = rawConfigText.match(/projectId:\s*["']([^"']+)["']/);
      const databaseURLMatch = rawConfigText.match(/databaseURL:\s*["']([^"']+)["']/);

      const updated = { ...formData };
      if (projectIdMatch && projectIdMatch[1]) {
        updated.projectId = projectIdMatch[1];
      }
      if (apiKeyMatch && apiKeyMatch[1]) {
        updated.apiKey = apiKeyMatch[1];
      }
      if (databaseURLMatch && databaseURLMatch[1]) {
        updated.databaseURL = databaseURLMatch[1];
      }

      setFormData(updated);
      setParseNotice(`✅ Đã tự động nhận diện: ProjectID="${updated.projectId}", API Key="${updated.apiKey ? updated.apiKey.substring(0, 10) + '...' : 'Chưa có'}"`);
      setTimeout(() => setParseNotice(null), 4000);
    } catch (err: any) {
      setParseNotice('❌ Không phân tích được đoạn mã. Vui lòng điền trực tiếp vào các ô bên dưới.');
    }
  };

  const handleSendTestPacket = async () => {
    setIsTesting(true);
    setTestStatus('Đang gửi gói tin mẫu lên Firebase...');
    try {
      await pushMockTelemetryToFirebase(formData, {
        bpm: 78,
        spo2: 98.6,
        postureStatus: 0,
        trackingActive: true,
        inZone: true,
      });
      setTestStatus('✅ Đã gửi thành công! Dữ liệu sẽ xuất hiện trên màn hình ngay lập tức.');
    } catch (err: any) {
      setTestStatus(`❌ Lỗi gửi: ${err.message || 'Kiểm tra lại quyền ghi Firestore Rules hoặc API Key'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearData = async () => {
    setIsClearing(true);
    setTestStatus('Đang xóa dữ liệu cũ trên Firebase về trạng thái chờ...');
    try {
      await clearFirebaseTelemetry(formData);
      setTestStatus('✅ Đã xóa dữ liệu cũ trên Firebase! Màn hình theo dõi đã quay về trạng thái rỗng chờ kết nối mới.');
    } catch (err: any) {
      setTestStatus(`❌ Lỗi xóa: ${err.message || 'Kiểm tra quyền ghi Firestore Rules'}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cấu Hình Kết Nối Firebase</h3>
              <p className="text-xs text-slate-400 font-mono">
                Project ID của bạn: <span className="text-emerald-400 font-bold">{formData.projectId || 'theodoisk-66ddb'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="mt-4 space-y-4 text-xs overflow-y-auto pr-1">
          {/* Status Alert */}
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 ${
            isConnected
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
              : 'bg-amber-950/40 text-amber-300 border-amber-800/60'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
              <div>
                <span className="font-bold">Trạng thái: </span>
                <span>{isConnected ? `Đã đồng bộ trực tiếp với Firebase "${formData.projectId}"` : `Đang lắng nghe gói tin từ Firebase "${formData.projectId}"`}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              ID: {formData.projectId}
            </span>
          </div>

          {/* Screenshot Detection Banner */}
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-200">
            <div className="font-bold text-emerald-300 mb-1 flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              Đã nhận diện vị trí dữ liệu thực tế từ Raspberry Pi 4 của bạn:
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              Dữ liệu của bạn được lưu trong Collection: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 font-mono">devices</code> và Document: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-sky-300 font-mono">pi4_node_1</code>. 
              Các trường <b className="text-white">heart_rate: 80</b>, <b className="text-white">spo2: 97.9</b>, <b className="text-white">angle_neck: 125</b>, <b className="text-rose-300">posture_status: "TU THE SAI"</b> đã được cấu hình đồng bộ tự động.
            </p>
          </div>

          {/* Quick Paste config from Firebase Web App */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5 text-[11px]">
                <ClipboardPaste className="w-3.5 h-3.5 text-sky-400" />
                Dán nhanh đoạn mã cấu hình Web App (Nếu bạn đã bấm "+ Add app" trên Firebase):
              </label>
              <button
                type="button"
                onClick={handleParseRawConfig}
                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10px] transition"
              >
                Tự động điền
              </button>
            </div>
            <textarea
              rows={2}
              value={rawConfigText}
              onChange={e => setRawConfigText(e.target.value)}
              placeholder='Dán đoạn const firebaseConfig = { apiKey: "AIzaSy...", projectId: "theodoisk-66ddb", ... }; vào đây'
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono text-[10px] focus:outline-none focus:border-sky-500"
            />
            {parseNotice && (
              <p className="text-[11px] font-medium text-emerald-400">{parseNotice}</p>
            )}
          </div>

          {/* Database Mode Switcher */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Loại Cơ Sở Dữ Liệu Firebase bạn dùng trên Pi 4:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, useRealtimeDb: false })}
                className={`py-2 px-3 rounded-lg border text-left transition ${
                  !formData.useRealtimeDb
                    ? 'bg-sky-600/20 border-sky-500 text-sky-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold">Cloud Firestore (Khuyên dùng)</div>
                <div className="text-[10px] text-slate-400 font-normal">Đã có nút tắt Firestore trên menu trái của bạn</div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, useRealtimeDb: true })}
                className={`py-2 px-3 rounded-lg border text-left transition ${
                  formData.useRealtimeDb
                    ? 'bg-sky-600/20 border-sky-500 text-sky-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold">Realtime Database</div>
                <div className="text-[10px] text-slate-400 font-normal">JSON REST API qua lệnh requests.put</div>
              </button>
            </div>
          </div>

          {/* Project ID input */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Firebase Project ID:
            </label>
            <input
              type="text"
              value={formData.projectId}
              onChange={e => setFormData({ ...formData, projectId: e.target.value })}
              placeholder="theodoisk-66ddb"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Path or Collection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {formData.useRealtimeDb ? 'Tên Node RTDB:' : 'Tên Collection:'}
              </label>
              <input
                type="text"
                value={formData.collectionName}
                onChange={e => setFormData({ ...formData, collectionName: e.target.value })}
                placeholder="theodoisk"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            {!formData.useRealtimeDb ? (
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Document ID:
                </label>
                <input
                  type="text"
                  value={formData.documentId}
                  onChange={e => setFormData({ ...formData, documentId: e.target.value })}
                  placeholder="live"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Database URL (RTDB):
                </label>
                <input
                  type="text"
                  value={formData.databaseURL || ''}
                  onChange={e => setFormData({ ...formData, databaseURL: e.target.value })}
                  placeholder="https://theodoisk-66ddb-default-rtdb.firebaseio.com"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>

          {/* Web API Key (Optional) */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Web API Key (Lấy từ "+ Add app" trên Firebase Console):
            </label>
            <input
              type="text"
              value={formData.apiKey}
              onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Troubleshooting Checklist */}
          <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-2 text-amber-200">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Tại sao gửi thử chưa thấy dữ liệu trên Firebase Console?
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
              <li>
                <b>Chưa bấm "Create database":</b> Trên Firebase Console, ở menu trái bấm vào <span className="text-white font-semibold">Firestore</span> → Bấm nút xanh <span className="text-emerald-400 font-semibold">"Create database"</span>.
              </li>
              <li>
                <b>Chưa mở quyền ghi (Rules):</b> Vào tab <span className="text-white font-semibold">Rules</span> của Firestore → Sửa thành <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300 font-mono">allow read, write: if true;</code> rồi bấm <b>Publish</b>.
              </li>
              <li>
                <b>Cần tải lại trang Firestore:</b> Sau khi bấm gửi thử, bấm nút <i>F5 / Refresh</i> trên tab Firestore Console để thấy collection <code className="text-sky-300 font-mono">theodoisk</code> và document <code className="text-sky-300 font-mono">live</code> xuất hiện!
              </li>
            </ol>
          </div>

          {/* Test and Reset buttons */}
          <div className="pt-1 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSendTestPacket}
                disabled={isTesting || isClearing}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 text-sky-300 border border-slate-700 hover:bg-slate-750 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Đang gửi...' : 'Gửi gói tin thử nghiệm'}</span>
              </button>
              <button
                type="button"
                onClick={handleClearData}
                disabled={isTesting || isClearing}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearing ? 'Đang xóa...' : 'Xóa dữ liệu cũ trên Firebase'}</span>
              </button>
            </div>
            {testStatus && (
              <p className="text-[11px] text-center mt-1.5 font-mono text-slate-300">
                {testStatus}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
          >
            Lưu Cấu Hình
          </button>
        </div>
      </div>
    </div>
  );
};

