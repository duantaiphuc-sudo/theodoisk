import React, { useState, useEffect } from 'react';
import { 
  AuthUser, 
  FirebaseConnectionConfig, 
  UserTaskNotification, 
  NotificationType, 
  NotificationPriority,
  TaskStatus 
} from '../types';
import { 
  X, 
  Users, 
  Search, 
  Shield, 
  Trash2, 
  Edit3, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  LogIn, 
  Heart, 
  Mail, 
  Calendar, 
  Building,
  Activity,
  Bell,
  Send,
  CheckSquare,
  Clock,
  User,
  Radio,
  FileText,
  Bot,
  Eye,
  SlidersHorizontal
} from 'lucide-react';
import { 
  fetchAllUsers, 
  adminUpdateUser, 
  adminDeleteUser, 
  adminCreateUser, 
  saveCurrentUser,
  isUserAdmin,
  adminAssignDevice
} from '../services/authService';
import {
  sendTaskNotificationToFirebase,
  subscribeToTaskNotifications,
  updateTaskStatusInFirebase,
  deleteTaskFromFirebase,
  getSavedFirebaseConfig
} from '../services/firebase';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  firebaseConfig?: FirebaseConnectionConfig;
  onQueryUserChatbot?: (userId: string) => void;
  onOpenUserThresholds?: (userId: string) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  firebaseConfig,
  onQueryUserChatbot,
  onOpenUserThresholds,
}) => {
  const config = firebaseConfig || getSavedFirebaseConfig();
  const [activeTab, setActiveTab] = useState<'accounts' | 'tasks' | 'biometrics_query'>('accounts');

  // Users state
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Edit modal states
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Tasks & Notifications state
  const [tasks, setTasks] = useState<UserTaskNotification[]>([]);
  const [isSendingTask, setIsSendingTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [newTaskForm, setNewTaskForm] = useState({
    targetUserId: 'all',
    type: 'task' as NotificationType,
    title: '',
    content: '',
    priority: 'normal' as NotificationPriority,
    deadline: '',
  });

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('Lỗi tải danh sách người dùng:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      // Subscribe to tasks
      const unsub = subscribeToTaskNotifications(config, currentUser.id, (notifs) => {
        setTasks(notifs);
      });
      return () => unsub();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  });

  const filteredTasks = tasks.filter(t => {
    if (taskFilter === 'pending') return t.status !== 'completed';
    if (taskFilter === 'completed') return t.status === 'completed';
    return true;
  });

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser.id) {
      setNotice('Không thể tự xóa tài khoản đang đăng nhập hiện tại!');
      setTimeout(() => setNotice(null), 3500);
      setConfirmDeleteId(null);
      return;
    }
    const ok = await adminDeleteUser(userId);
    if (ok) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDeleteId(null);
      setNotice('Đã xóa tài khoản khỏi hệ thống và Firebase Firestore.');
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const handleDeviceChange = async (userId: string, newDevice: string) => {
    const cleanDevice = newDevice.trim();
    // Cập nhật lạc quan trên giao diện ngay lập tức
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, device: cleanDevice, deviceId: cleanDevice } : u));

    try {
      const ok = await adminAssignDevice(userId, cleanDevice);
      if (ok) {
        const u = users.find(x => x.id === userId);
        const name = u?.fullName || 'Người dùng';
        const label = cleanDevice ? cleanDevice : 'Trống (Thu hồi)';
        setNotice(`Đã cập nhật gán thiết bị [${label}] cho: ${name}`);
        setTimeout(() => setNotice(null), 3000);
      } else {
        // Hoàn tác cập nhật lạc quan khi thất bại
        const list = await fetchAllUsers();
        setUsers(list);
        setNotice('Lỗi: Gán thiết bị thất bại. Yêu cầu quyền Quản trị viên (admin).');
        setTimeout(() => setNotice(null), 4000);
      }
    } catch (e) {
      console.error('Error assigning device:', e);
      const list = await fetchAllUsers();
      setUsers(list);
      setNotice('Lỗi hệ thống khi gán thiết bị.');
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    // Kiểm tra xem trường thiết bị có bị thay đổi không
    const originalUser = users.find(u => u.id === editingUser.id);
    const originalDevice = (originalUser?.deviceId || originalUser?.device || '').trim();
    const newDevice = (editingUser.deviceId || editingUser.device || '').trim();

    if (newDevice !== originalDevice) {
      const okAssign = await adminAssignDevice(editingUser.id, newDevice);
      if (!okAssign) {
        setNotice('Lỗi: Không thể chuyển gán thiết bị qua Firestore Transaction.');
        setTimeout(() => setNotice(null), 4000);
        return;
      }
    }

    const ok = await adminUpdateUser(editingUser);
    if (ok) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
      setEditingUser(null);
      setNotice(`Đã cập nhật thông tin cho ${editingUser.fullName}`);
      setTimeout(() => setNotice(null), 3000);
    }
  };



  const handleAssignTaskShortcut = (user: AuthUser) => {
    setActiveTab('tasks');
    setNewTaskForm(prev => ({
      ...prev,
      targetUserId: user.id,
      title: `Nhiệm vụ cho ${user.fullName}: `,
    }));
  };

  const handleSendTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskForm.title.trim() || !newTaskForm.content.trim()) return;

    setIsSendingTask(true);
    try {
      const targetUser = users.find(u => u.id === newTaskForm.targetUserId || u.email === newTaskForm.targetUserId);
      const targetUserName = newTaskForm.targetUserId === 'all' 
        ? 'Tất cả thành viên' 
        : (targetUser?.fullName || newTaskForm.targetUserId);

      await sendTaskNotificationToFirebase(config, {
        targetUserId: newTaskForm.targetUserId,
        targetUserName: targetUserName,
        senderId: currentUser.id,
        senderName: currentUser.fullName,
        type: newTaskForm.type,
        title: newTaskForm.title.trim(),
        content: newTaskForm.content.trim(),
        priority: newTaskForm.priority,
        deadline: newTaskForm.deadline.trim() || undefined,
      });

      setNewTaskForm({
        targetUserId: 'all',
        type: 'task',
        title: '',
        content: '',
        priority: 'normal',
        deadline: '',
      });

      setNotice(`Đã gửi thông báo/giao việc thành công tới: ${targetUserName}`);
      setTimeout(() => setNotice(null), 3500);
    } catch (err) {
      console.error('Lỗi khi gửi task:', err);
      setNotice('Lỗi khi gửi thông báo lên Firebase.');
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setIsSendingTask(false);
    }
  };

  const handleToggleTaskStatus = async (task: UserTaskNotification) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    await updateTaskStatusInFirebase(config, task.id, nextStatus);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTaskFromFirebase(config, taskId);
  };

  const pendingCount = tasks.filter(t => t.status !== 'completed').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/55 backdrop-blur-[2px] animate-fadeIn">
      <div 
        className="bg-white rounded-2xl border-2 border-slate-800 shadow-[0_8px_0_#1E293B] w-[98vw] sm:w-[95vw] max-w-6xl max-h-[94vh] flex flex-col overflow-hidden text-slate-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b-2 border-slate-800 bg-[#FDFBF7] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#BAE0EC] border-[1.5px] border-slate-800 text-slate-900 flex items-center justify-center shrink-0 shadow-[0_2px_0_#1E293B]">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight truncate">
                  Trung Tâm Quản Trị Tài Khoản & Giao Việc
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#B2F5BE] text-slate-900 border border-slate-800 whitespace-nowrap">
                  Admin Console
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate font-medium">
                Đồng bộ hai chiều với Firebase Firestore (collections: users, notifications)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="tactile-btn-white w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 py-2.5 border-b-2 border-slate-800 bg-[#FAF7F0] flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 border-[1.5px] transition cursor-pointer whitespace-nowrap ${
              activeTab === 'accounts'
                ? 'bg-[#16B364] text-white border-slate-900 shadow-[0_2px_0_#0F172A]'
                : 'bg-white text-slate-700 border-slate-800 hover:bg-[#F3EFE6]'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Tài Khoản Đã Đăng Nhập</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-extrabold border border-slate-800 ${
              activeTab === 'accounts' ? 'bg-white text-slate-900' : 'bg-[#BAE0EC] text-slate-900'
            }`}>
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 border-[1.5px] transition cursor-pointer whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'bg-[#16B364] text-white border-slate-900 shadow-[0_2px_0_#0F172A]'
                : 'bg-white text-slate-700 border-slate-800 hover:bg-[#F3EFE6]'
            }`}
          >
            <Bell className="w-4 h-4 shrink-0" />
            <span>Giao Việc & Gửi Thông Báo</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-extrabold bg-[#FDE68A] text-slate-900 border border-slate-800 whitespace-nowrap">
                {pendingCount} đang xử lý
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('biometrics_query')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 border-[1.5px] transition cursor-pointer whitespace-nowrap ${
              activeTab === 'biometrics_query'
                ? 'bg-[#16B364] text-white border-slate-900 shadow-[0_2px_0_#0F172A]'
                : 'bg-white text-slate-700 border-slate-800 hover:bg-[#F3EFE6]'
            }`}
          >
            <Activity className={`w-4 h-4 shrink-0 ${activeTab === 'biometrics_query' ? 'text-white' : 'text-[#16B364]'}`} />
            <span>Truy Vấn Sức Khỏe Thành Viên</span>
          </button>
        </div>

        {/* Notice Message */}
        {notice && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-[#B2F5BE] border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] text-slate-900 text-xs font-bold flex items-center gap-2 animate-fadeIn shrink-0">
            <CheckCircle2 className="w-4 h-4 text-slate-900 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* TAB 1: ACCOUNTS LIST */}
        {activeTab === 'accounts' && (
          <>
            {/* Action Bar */}
            <div className="p-4 sm:p-5 border-b-[1.5px] border-slate-800 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tài khoản theo tên, email, phòng ban..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 text-slate-900 font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#16B364]/30 transition"
                />
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={loadUsers}
                  disabled={isLoading}
                  className="tactile-btn-white flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#16B364] ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
                </button>
              </div>
            </div>

            {/* User List Table */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#FDFBF7]/60">
              {isLoading ? (
                <div className="py-16 text-center text-slate-600">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#16B364] mb-2" />
                  <p className="text-xs font-semibold">Đang tải danh sách tài khoản từ Firestore...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-16 text-center text-slate-600 bg-white rounded-2xl border-2 border-dashed border-slate-400">
                  <Users className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs font-semibold">Không tìm thấy tài khoản nào phù hợp với tìm kiếm.</p>
                </div>
              ) : (
                <div className="border-2 border-slate-800 rounded-2xl overflow-x-auto shadow-[0_4px_0_#1E293B] bg-white">
                  <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                    <thead className="bg-[#FAF7F0] border-b-2 border-slate-800 text-slate-800 font-extrabold uppercase text-[11px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[240px]">Thành Viên</th>
                        <th className="py-3.5 px-4 whitespace-nowrap text-center w-36">Vai Trò</th>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[170px]">Thể Trạng & Tuổi</th>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">Phòng Ban</th>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">Thiết Bị (DeviceId)</th>
                        <th className="py-3.5 px-4 whitespace-nowrap text-right pr-4 min-w-[230px]">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredUsers.map(u => {
                        const isCurrent = u.id === currentUser.id || u.email === currentUser.email;
                        const isAdmin = u.role === 'admin' || u.role === 'manager';
                        const hM = (u.height || 170) / 100;
                        const bmiVal = ((u.weight || 65) / (hM * hM)).toFixed(1);

                        return (
                          <tr 
                            key={u.id} 
                            className={`hover:bg-[#FAF7F0]/70 transition-colors ${isCurrent ? 'bg-[#BAE0EC]/20 font-medium' : ''}`}
                          >
                            {/* Member info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-[#FAF7F0] overflow-hidden border-[1.5px] border-slate-800 shrink-0 flex items-center justify-center font-extrabold text-slate-900 text-xs shadow-[0_2px_0_#1E293B]">
                                  {u.avatar ? (
                                    <img src={u.avatar} alt={u.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    u.fullName.charAt(0).toUpperCase()
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900 text-xs sm:text-sm">{u.fullName}</span>
                                    {isCurrent && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#BAE0EC] text-slate-900 border border-slate-800 whitespace-nowrap">
                                        Hiện tại
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-600 block mt-0.5">
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Role display */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {isAdmin ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-800 bg-[#FDE68A] text-slate-900 shadow-[0_2px_0_#1E293B] select-none whitespace-nowrap">
                                  <Shield className="w-3.5 h-3.5 text-slate-900" />
                                  <span>Admin</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-800 bg-[#FAF7F0] text-slate-800 select-none whitespace-nowrap">
                                  <User className="w-3.5 h-3.5 text-slate-700" />
                                  <span>Nhân viên</span>
                                </span>
                              )}
                            </td>

                            {/* Age & Biometrics */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-900 text-xs tabular-nums">
                                    {u.age || 28} tuổi
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#FAF7F0] text-slate-900 border border-slate-800 tabular-nums">
                                    BMI {bmiVal}
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-slate-600 block tabular-nums">
                                  {u.height || 170}cm • {u.weight || 65}kg
                                </span>
                              </div>
                            </td>

                            {/* Department */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FAF7F0] text-slate-800 border border-slate-800 whitespace-nowrap">
                                {u.department || 'Văn Phòng IoT'}
                              </span>
                            </td>

                            {/* Device ID / Gán Thiết Bị */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Radio className={`w-3.5 h-3.5 shrink-0 ${u.device ? 'text-[#16B364]' : 'text-slate-400'}`} />
                                <select
                                  value={u.device || u.deviceId || ''}
                                  onChange={(e) => handleDeviceChange(u.id, e.target.value)}
                                  className={`h-9 px-2.5 py-1 text-xs font-mono rounded-xl border-[1.5px] border-slate-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#16B364]/30 ${
                                    u.device
                                      ? 'bg-[#B2F5BE]/55 text-slate-900 font-bold shadow-[0_2px_0_#1E293B]'
                                      : 'bg-[#FAF7F0] text-slate-700 font-medium'
                                  }`}
                                  title={`Chọn gán thiết bị cho ${u.fullName}`}
                                >
                                  <option value="">Trống (Chưa gán)</option>
                                  <option value="pi4_node_1">pi4_node_1</option>
                                  <option value="pi4_node_2">pi4_node_2</option>
                                </select>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Direct Send Task Shortcut */}
                                {!isUserAdmin(u) && (
                                  <button
                                    type="button"
                                    onClick={() => handleAssignTaskShortcut(u)}
                                    title={`Giao việc / gửi thông báo riêng cho ${u.fullName}`}
                                    className="h-9 px-2.5 rounded-xl bg-[#BAE0EC] hover:bg-[#a6d5e4] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center gap-1.5 transition cursor-pointer text-xs font-bold active:translate-y-[1px] whitespace-nowrap"
                                  >
                                    <Send className="w-3.5 h-3.5 text-slate-900" />
                                    <span>Giao việc</span>
                                  </button>
                                )}

                                {/* Direct Open Alert Thresholds Settings for User */}
                                {onOpenUserThresholds && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onOpenUserThresholds(u.id);
                                      onClose();
                                    }}
                                    title={`Xem & chỉnh sửa ngưỡng cảnh báo của ${u.fullName}`}
                                    className="h-9 px-2.5 rounded-xl bg-[#FDE68A] hover:bg-[#fcd34d] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center gap-1.5 transition cursor-pointer text-xs font-bold active:translate-y-[1px] whitespace-nowrap"
                                  >
                                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-900" />
                                    <span>Ngưỡng đo</span>
                                  </button>
                                )}

                                {/* Direct Ask AI / Query Health */}
                                {onQueryUserChatbot && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onQueryUserChatbot(u.id);
                                      onClose();
                                    }}
                                    title={`Mở Trợ lý AI để truy vấn và phân tích sức khỏe của ${u.fullName}`}
                                    className="h-9 px-2.5 rounded-xl bg-[#B2F5BE] hover:bg-[#9aeaa8] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center gap-1.5 transition cursor-pointer text-xs font-bold active:translate-y-[1px] whitespace-nowrap"
                                  >
                                    <Bot className="w-3.5 h-3.5 text-slate-900" />
                                    <span>Hỏi AI</span>
                                  </button>
                                )}

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => setEditingUser(u)}
                                  title="Chỉnh sửa thông tin tài khoản"
                                  className="tactile-btn-white w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete button */}
                                {!isCurrent && (
                                  <>
                                    {confirmDeleteId === u.id ? (
                                      <div className="flex items-center gap-1.5 bg-[#FBC2C8] border-[1.5px] border-slate-800 px-2 h-9 rounded-xl shadow-[0_2px_0_#1E293B]">
                                        <span className="text-[11px] font-extrabold text-slate-900">Xóa?</span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteUser(u.id)}
                                          className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white border border-slate-900 text-[10px] font-bold transition cursor-pointer whitespace-nowrap"
                                        >
                                          Đồng ý
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 border border-slate-800 text-[10px] font-bold transition cursor-pointer whitespace-nowrap"
                                        >
                                          Hủy
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(u.id)}
                                        title="Xóa tài khoản này"
                                        className="w-9 h-9 rounded-xl bg-white hover:bg-[#FBC2C8] text-slate-800 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center transition cursor-pointer active:translate-y-[1px]"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: TASKS & NOTIFICATIONS */}
        {activeTab === 'tasks' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 bg-[#FDFBF7]/60">
            {/* Create Task Form */}
            <div className="bg-[#FAF7F0] border-2 border-slate-800 shadow-[0_4px_0_#1E293B] rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[#BAE0EC] border-[1.5px] border-slate-800 text-slate-900 flex items-center justify-center shrink-0 shadow-[0_2px_0_#1E293B]">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">Giao Việc Hoặc Gửi Thông Báo Mới</h4>
                  <p className="text-xs text-slate-600 font-medium">Thông báo/Task sẽ lập tức hiển thị trực tiếp trên màn hình của người dùng qua Firebase</p>
                </div>
              </div>

              <form onSubmit={handleSendTaskSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Target user selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Người Nhận / Đối Tượng *
                    </label>
                    <select
                      value={newTaskForm.targetUserId}
                      onChange={e => setNewTaskForm({ ...newTaskForm, targetUserId: e.target.value })}
                      className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-white border-[1.5px] border-slate-800 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#16B364]/30"
                    >
                      <option value="all">📢 Tất cả thành viên (Gửi chung)</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          👤 {u.fullName} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notification Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Loại Thông Báo *
                    </label>
                    <select
                      value={newTaskForm.type}
                      onChange={e => setNewTaskForm({ ...newTaskForm, type: e.target.value as NotificationType })}
                      className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-white border-[1.5px] border-slate-800 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#16B364]/30"
                    >
                      <option value="task">📋 Giao việc / Task công việc</option>
                      <option value="health_alert">🧘 Nhắc nhở sức khỏe / Tư thế</option>
                      <option value="general">📢 Thông báo chung / Quy định</option>
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Mức Độ Ưu Tiên *
                    </label>
                    <select
                      value={newTaskForm.priority}
                      onChange={e => setNewTaskForm({ ...newTaskForm, priority: e.target.value as NotificationPriority })}
                      className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-white border-[1.5px] border-slate-800 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#16B364]/30"
                    >
                      <option value="normal">⚪ Bình thường</option>
                      <option value="high">🟡 Ưu tiên cao</option>
                      <option value="urgent">🔴 Khẩn cấp (Hiện nổi bật màn hình)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Title */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Tiêu Đề Thông Báo / Tên Task *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Kiểm tra tư thế ngồi buổi chiều, hoặc Nộp báo cáo tuần"
                      value={newTaskForm.title}
                      onChange={e => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                      className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-white border-[1.5px] border-slate-800 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#16B364]/30"
                    />
                  </div>

                  {/* Optional Deadline */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Hạn Chót (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Trước 17:00 hôm nay"
                      value={newTaskForm.deadline}
                      onChange={e => setNewTaskForm({ ...newTaskForm, deadline: e.target.value })}
                      className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-white border-[1.5px] border-slate-800 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#16B364]/30"
                    />
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nội Dung Chi Tiết / Hướng Dẫn *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Mô tả công việc cần làm, vị trí hoặc chỉ dẫn cụ thể cho thành viên..."
                    value={newTaskForm.content}
                    onChange={e => setNewTaskForm({ ...newTaskForm, content: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl text-xs bg-white border-[1.5px] border-slate-800 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#16B364]/30"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={isSendingTask}
                    className="tactile-btn-primary flex items-center gap-1.5 min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingTask ? 'Đang gửi...' : 'Phát Thông Báo / Giao Việc'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* List of Sent Tasks */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-extrabold text-slate-900">Danh Sách Nhiệm Vụ & Thông Báo Đã Gửi</h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-extrabold bg-[#BAE0EC] text-slate-900 border border-slate-800">
                    {tasks.length}
                  </span>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 bg-[#FAF7F0] border-[1.5px] border-slate-800 p-1 rounded-xl text-xs self-start sm:self-auto">
                  <button
                    onClick={() => setTaskFilter('all')}
                    className={`min-h-[34px] px-3 py-1 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                      taskFilter === 'all' ? 'bg-[#16B364] text-white border border-slate-900 shadow-[0_1px_0_#0F172A]' : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => setTaskFilter('pending')}
                    className={`min-h-[34px] px-3 py-1 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                      taskFilter === 'pending' ? 'bg-[#16B364] text-white border border-slate-900 shadow-[0_1px_0_#0F172A]' : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Đang xử lý
                  </button>
                  <button
                    onClick={() => setTaskFilter('completed')}
                    className={`min-h-[34px] px-3 py-1 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                      taskFilter === 'completed' ? 'bg-[#16B364] text-white border border-slate-900 shadow-[0_1px_0_#0F172A]' : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Đã hoàn thành
                  </button>
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="py-10 text-center text-slate-600 bg-white rounded-2xl border-2 border-dashed border-slate-400">
                  <FileText className="w-8 h-8 mx-auto text-slate-400 mb-1.5" />
                  <p className="text-xs font-semibold">Chưa có thông báo hoặc nhiệm vụ nào trong mục này.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTasks.map(t => {
                    const isCompleted = t.status === 'completed';
                    const isAck = t.status === 'acknowledged';

                    return (
                      <div 
                        key={t.id}
                        className={`p-4 rounded-2xl border-2 border-slate-800 shadow-[0_3px_0_#1E293B] transition ${
                          isCompleted 
                            ? 'bg-[#FAF7F0] text-slate-700' 
                            : t.priority === 'urgent'
                            ? 'bg-[#FBC2C8]/35'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Priority Badge */}
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border border-slate-800 whitespace-nowrap ${
                                t.priority === 'urgent' 
                                  ? 'bg-[#FBC2C8] text-slate-900' 
                                  : t.priority === 'high' 
                                  ? 'bg-[#FDE68A] text-slate-900' 
                                  : 'bg-[#FAF7F0] text-slate-800'
                              }`}>
                                {t.priority === 'urgent' ? 'Khẩn cấp' : t.priority === 'high' ? 'Ưu tiên' : 'Thường'}
                              </span>

                              {/* Target user badge */}
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#BAE0EC] text-slate-900 border border-slate-800 whitespace-nowrap">
                                Gửi: {t.targetUserName || (t.targetUserId === 'all' ? 'Tất cả' : t.targetUserId)}
                              </span>

                              {/* Status Badge */}
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-800 whitespace-nowrap ${
                                isCompleted 
                                  ? 'bg-[#B2F5BE] text-slate-900' 
                                  : isAck 
                                  ? 'bg-[#BAE0EC] text-slate-900' 
                                  : 'bg-[#FDE68A] text-slate-900'
                              }`}>
                                {isCompleted ? '✓ Đã hoàn thành' : isAck ? 'Đang xử lý (Đã nhận)' : 'Chờ thực hiện'}
                              </span>
                            </div>

                            <h5 className={`text-xs sm:text-sm font-extrabold ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                              {t.title}
                            </h5>

                            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {t.content}
                            </p>

                            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-600 pt-1 font-medium">
                              <span>Gửi bởi: <b className="text-slate-900">{t.senderName}</b></span>
                              <span>•</span>
                              <span className="font-mono">{new Date(t.createdAt).toLocaleString('vi-VN')}</span>
                              {t.deadline && (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 rounded-full bg-[#FDE68A]/70 border border-slate-800 text-slate-900 font-bold whitespace-nowrap">
                                    Hạn: {t.deadline}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-start pt-1 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleToggleTaskStatus(t)}
                              title={isCompleted ? 'Đánh dấu chưa xong' : 'Đánh dấu đã hoàn thành'}
                              className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                                isCompleted 
                                  ? 'tactile-btn-white' 
                                  : 'tactile-btn-primary'
                              }`}
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>{isCompleted ? 'Mở lại' : 'Hoàn thành'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteTask(t.id)}
                              title="Xóa thông báo này"
                              className="w-9 h-9 rounded-xl bg-white hover:bg-[#FBC2C8] text-slate-800 border-[1.5px] border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center transition cursor-pointer active:translate-y-[1px]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: BIOMETRICS & ERGONOMIC QUERY CONSOLE FOR ADMIN */}
        {activeTab === 'biometrics_query' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#FDFBF7]/60">
            {/* Header Toolbar */}
            <div className="p-4 sm:p-5 border-b-[1.5px] border-slate-800 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tra cứu thành viên theo tên, email, phòng ban..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 text-slate-900 font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#16B364]/30 transition"
                />
              </div>

              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1.5 rounded-full bg-[#FAF7F0] border border-slate-800 text-xs text-slate-700 font-bold whitespace-nowrap">
                  Tổng số: <b className="text-slate-900 font-mono">{filteredUsers.length}</b> thành viên
                </span>
                <button
                  onClick={loadUsers}
                  disabled={isLoading}
                  className="tactile-btn-white flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#16B364] ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
                </button>
              </div>
            </div>

            {/* Members Biometric Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {filteredUsers.length === 0 ? (
                <div className="py-16 text-center text-slate-600 bg-white rounded-2xl border-2 border-dashed border-slate-400">
                  <Users className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs font-semibold">Không tìm thấy thành viên nào phù hợp.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredUsers.map(u => {
                    const hM = (u.height || 170) / 100;
                    const bmi = ((u.weight || 65) / (hM * hM)).toFixed(1);

                    return (
                      <div 
                        key={u.id}
                        className="bg-white rounded-2xl border-2 border-slate-800 p-4 shadow-[0_4px_0_#1E293B] hover:bg-[#FDFBF7] transition-all flex flex-col justify-between gap-3.5"
                      >
                        {/* Member Card Header */}
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-full bg-[#FAF7F0] overflow-hidden border-[1.5px] border-slate-800 shrink-0 flex items-center justify-center font-extrabold text-slate-900 text-sm shadow-[0_2px_0_#1E293B]">
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              u.fullName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">{u.fullName}</h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-slate-800 whitespace-nowrap ${
                                u.role === 'admin' ? 'bg-[#FDE68A] text-slate-900' : 'bg-[#FAF7F0] text-slate-800'
                              }`}>
                                {u.role === 'admin' ? 'Admin' : 'Nhân viên'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 font-mono truncate">{u.email}</p>
                            <p className="text-[10px] text-slate-600 mt-0.5 font-medium">
                              {u.department || 'Văn Phòng IoT'} • Node: <span className="font-mono font-bold text-slate-900">{u.device || 'Chưa gán'}</span>
                            </p>
                          </div>
                        </div>

                        {/* Health Specs */}
                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-[#FAF7F0] border-[1.5px] border-slate-800 text-center text-xs">
                          <div>
                            <span className="text-[10px] text-slate-600 block uppercase font-bold">Thể trạng</span>
                            <span className="font-mono font-extrabold text-slate-900 tabular-nums">{u.height || 170}cm / {u.weight || 65}kg</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-600 block uppercase font-bold">Chỉ số BMI</span>
                            <span className="font-mono font-extrabold text-sky-900 tabular-nums">{bmi}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-600 block uppercase font-bold">Mục tiêu ngồi</span>
                            <span className="font-mono font-extrabold text-emerald-800 tabular-nums">{u.maxSittingHours || 6}h/ngày</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                          {onQueryUserChatbot && (
                            <button
                              type="button"
                              onClick={() => {
                                onQueryUserChatbot(u.id);
                                onClose();
                              }}
                              className="tactile-btn-primary flex-1 min-h-[40px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              <Bot className="w-3.5 h-3.5" />
                              <span>Hỏi AI về người này</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAssignTaskShortcut(u)}
                            className="tactile-btn-secondary min-h-[40px] px-3 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Gửi thông báo / giao việc nhắc nhở"
                          >
                            <Send className="w-3 h-3" />
                            <span>Nhắc nhở</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="px-4 py-3 border-t-2 border-slate-800 bg-[#FDFBF7] text-center text-[11px] text-slate-700 font-semibold shrink-0">
          Dữ liệu tài khoản & giao việc tự động lưu và đồng bộ tức thời với Cloud Firestore
        </div>
      </div>

      {/* Sub-modal: Edit User Profile */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px] animate-fadeIn">
          <div className="bg-white rounded-2xl border-2 border-slate-800 shadow-[0_8px_0_#1E293B] max-w-md w-full overflow-hidden text-slate-900">
            <div className="flex items-center justify-between border-b-2 border-slate-800 bg-[#FDFBF7] px-5 py-3.5">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 truncate pr-2">
                <span className="w-7 h-7 rounded-lg bg-[#BAE0EC] border border-slate-800 flex items-center justify-center shrink-0">
                  <Edit3 className="w-3.5 h-3.5 text-slate-900" />
                </span>
                <span className="truncate">Chỉnh Sửa: {editingUser.fullName}</span>
              </h4>
              <button
                onClick={() => setEditingUser(null)}
                className="tactile-btn-white w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Họ và Tên</label>
                <input
                  type="text"
                  required
                  value={editingUser.fullName}
                  onChange={e => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 text-slate-900 font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#16B364]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Độ Tuổi</label>
                  <input
                    type="number"
                    value={editingUser.age || 28}
                    onChange={e => setEditingUser({ ...editingUser, age: parseInt(e.target.value) || 0 })}
                    className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 font-mono font-bold text-slate-900 focus:outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Giới Tính</label>
                  <select
                    value={editingUser.gender || 'male'}
                    onChange={e => setEditingUser({ ...editingUser, gender: e.target.value as any })}
                    className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 font-semibold text-slate-900 focus:outline-none focus:bg-white"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Chiều Cao (cm)</label>
                  <input
                    type="number"
                    value={editingUser.height || 170}
                    onChange={e => setEditingUser({ ...editingUser, height: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 font-mono font-bold text-slate-900 focus:outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Cân Nặng (kg)</label>
                  <input
                    type="number"
                    value={editingUser.weight || 65}
                    onChange={e => setEditingUser({ ...editingUser, weight: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 font-mono font-bold text-slate-900 focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Phòng Ban</label>
                <input
                  type="text"
                  value={editingUser.department || ''}
                  onChange={e => setEditingUser({ ...editingUser, department: e.target.value })}
                  className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 text-slate-900 font-semibold focus:outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Gán Thiết Bị IoT (Device)</label>
                <select
                  value={editingUser.device || editingUser.deviceId || ''}
                  onChange={e => setEditingUser({ ...editingUser, deviceId: e.target.value, device: e.target.value })}
                  className="w-full h-10 px-3 py-2 rounded-xl text-xs bg-[#FAF7F0] border-[1.5px] border-slate-800 font-mono font-bold text-slate-900 focus:outline-none focus:bg-white"
                >
                  <option value="">Trống (Chưa gán)</option>
                  <option value="pi4_node_1">pi4_node_1</option>
                  <option value="pi4_node_2">pi4_node_2</option>
                </select>
                <p className="text-[10px] text-slate-600 mt-1 font-medium">Gán node thiết bị tương ứng để đồng bộ dữ liệu thời gian thực</p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="tactile-btn-white min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="tactile-btn-primary min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
