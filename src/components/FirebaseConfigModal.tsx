import React, { useState } from 'react';
import { X, Database, Send, Layers, ClipboardPaste, Trash2 } from 'lucide-react';
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
      setParseNotice(`Đã nhận diện: ProjectID="${updated.projectId}"`);
      setTimeout(() => setParseNotice(null), 3000);
    } catch {
      setParseNotice('Không phân tích được đoạn mã. Vui lòng nhập trực tiếp bên dưới.');
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
      setTestStatus('Đã gửi thành công gói tin mẫu.');
    } catch (err: any) {
      setTestStatus(`Lỗi gửi: ${err?.message || 'Kiểm tra lại quyền truy cập hoặc API Key'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearData = async () => {
    setIsClearing(true);
    setTestStatus('Đang xóa dữ liệu live trên Firebase...');
    try {
      await clearFirebaseTelemetry(formData);
      setTestStatus('Đã xóa dữ liệu live thành công.');
    } catch (err: any) {
      setTestStatus(`Lỗi xóa: ${err?.message || 'Kiểm tra quyền truy cập'}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#FDFBF7] border-b-2 border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Cấu Hình Kết Nối Firebase</h3>
              <p className="text-xs text-slate-600 font-mono">
                Project ID: <span className="text-emerald-700 font-bold">{formData.projectId || 'theodoisk-66ddb'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Status Alert */}
          <div className={`p-3.5 rounded-xl border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-between gap-2.5 ${
            isConnected
              ? 'bg-[#B2F5BE]/55 text-slate-900'
              : 'bg-[#FDE68A]/55 text-slate-900'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full border border-slate-800 ${isConnected ? 'bg-[#16B364] animate-ping' : 'bg-amber-500'}`}></span>
              <div>
                <span className="font-extrabold">Trạng thái: </span>
                <span className="font-semibold">{isConnected ? `Đã kết nối với "${formData.projectId}"` : `Chờ dữ liệu từ "${formData.projectId}"`}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white border-[1.5px] border-slate-800 text-slate-900 shrink-0">
              ID: {formData.projectId}
            </span>
          </div>

          {/* Quick Paste config from Firebase Web App */}
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="font-bold text-slate-900 flex items-center gap-1.5 text-[11px]">
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-700" />
                Dán nhanh đoạn mã cấu hình Firebase:
              </label>
              <button
                type="button"
                onClick={handleParseRawConfig}
                className="px-3 py-1 rounded-lg tactile-btn-primary font-bold text-[11px] cursor-pointer"
              >
                Tự động điền
              </button>
            </div>
            <textarea
              rows={2}
              value={rawConfigText}
              onChange={e => setRawConfigText(e.target.value)}
              placeholder='const firebaseConfig = { apiKey: "AIzaSy...", projectId: "theodoisk-66ddb", ... };'
              className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-[10px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {parseNotice && (
              <p className="text-[11px] font-bold text-emerald-700">{parseNotice}</p>
            )}
          </div>

          {/* Database Mode Switcher */}
          <div>
            <label className="block text-slate-800 font-bold mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-700" />
              Loại Cơ Sở Dữ Liệu Firebase:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, useRealtimeDb: false })}
                className={`py-2.5 px-3 rounded-xl text-left transition cursor-pointer ${
                  !formData.useRealtimeDb
                    ? 'bg-[#BAE0EC] border-2 border-slate-800 shadow-[0_2px_0_#1E293B] text-slate-900 font-bold'
                    : 'bg-[#FAF7F0] border-[1.5px] border-slate-800 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="font-extrabold">Cloud Firestore</div>
                <div className="text-[10px] text-slate-600 font-normal">Collection & Document</div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, useRealtimeDb: true })}
                className={`py-2.5 px-3 rounded-xl text-left transition cursor-pointer ${
                  formData.useRealtimeDb
                    ? 'bg-[#BAE0EC] border-2 border-slate-800 shadow-[0_2px_0_#1E293B] text-slate-900 font-bold'
                    : 'bg-[#FAF7F0] border-[1.5px] border-slate-800 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="font-extrabold">Realtime Database</div>
                <div className="text-[10px] text-slate-600 font-normal">REST API endpoint</div>
              </button>
            </div>
          </div>

          {/* Project ID input */}
          <div>
            <label className="block text-slate-800 font-bold mb-1">
              Firebase Project ID:
            </label>
            <input
              type="text"
              value={formData.projectId}
              onChange={e => setFormData({ ...formData, projectId: e.target.value })}
              placeholder="theodoisk-66ddb"
              className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Path or Collection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-800 font-bold mb-1">
                {formData.useRealtimeDb ? 'Tên Node RTDB:' : 'Tên Collection:'}
              </label>
              <input
                type="text"
                value={formData.collectionName}
                onChange={e => setFormData({ ...formData, collectionName: e.target.value })}
                placeholder="devices"
                className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>

            {!formData.useRealtimeDb ? (
              <div>
                <label className="block text-slate-800 font-bold mb-1">
                  Document ID:
                </label>
                <input
                  type="text"
                  value={formData.documentId}
                  onChange={e => setFormData({ ...formData, documentId: e.target.value })}
                  placeholder="pi4_node_1"
                  className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
            ) : (
              <div>
                <label className="block text-slate-800 font-bold mb-1">
                  Database URL (RTDB):
                </label>
                <input
                  type="text"
                  value={formData.databaseURL || ''}
                  onChange={e => setFormData({ ...formData, databaseURL: e.target.value })}
                  placeholder="https://theodoisk-66ddb-default-rtdb.firebaseio.com"
                  className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
            )}
          </div>

          {/* Web API Key (Optional) */}
          <div>
            <label className="block text-slate-800 font-bold mb-1">
              Web API Key:
            </label>
            <input
              type="text"
              value={formData.apiKey}
              onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 rounded-xl bg-white border-[1.5px] border-slate-800 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Test and Reset buttons */}
          <div className="pt-1 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleSendTestPacket}
                disabled={isTesting || isClearing}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold tactile-btn-white cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 text-emerald-700" />
                <span>{isTesting ? 'Đang gửi...' : 'Gửi gói tin thử nghiệm'}</span>
              </button>
              <button
                type="button"
                onClick={handleClearData}
                disabled={isTesting || isClearing}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold bg-[#FBC2C8] hover:bg-[#f9aeb6] text-slate-900 border-2 border-slate-800 shadow-[0_3px_0_#1E293B] active:translate-y-[2px] active:shadow-[0_1px_0_#1E293B] transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearing ? 'Đang xóa...' : 'Xóa dữ liệu live'}</span>
              </button>
            </div>
            {testStatus && (
              <p className="text-[11px] text-center mt-1.5 font-mono text-slate-700 font-bold bg-[#FAF7F0] py-1.5 px-3 rounded-lg border border-slate-300">
                {testStatus}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#FDFBF7] border-t-2 border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold tactile-btn-white cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-extrabold tactile-btn-primary cursor-pointer"
          >
            Lưu Cấu Hình
          </button>
        </div>
      </div>
    </div>
  );
};
