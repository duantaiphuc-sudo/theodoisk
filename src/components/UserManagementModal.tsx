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
  FileText
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
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  firebaseConfig,
}) => {
  const config = firebaseConfig || getSavedFirebaseConfig();
  const [activeTab, setActiveTab] = useState<'accounts' | 'tasks'>('accounts');

  // Users state
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Edit / Add modal states
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newUserForm, setNewUserForm] = useState<Partial<AuthUser>>({
    fullName: '',
    email: '',
    username: '',
    role: 'employee',
    department: 'Văn Phòng IoT',
    age: 28,
    gender: 'male',
    height: 170,
    weight: 65,
    maxSittingHours: 6,
  });

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
      alert('Không thể tự xóa tài khoản đang đăng nhập hiện tại!');
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
        const label = cleanDevice ? cleanDevice : 'Trống';
        setNotice(`Đã cập nhật gán thiết bị [${label}] cho: ${name}`);
        setTimeout(() => setNotice(null), 3000);
      } else {
        setNotice('Không thể cập nhật thiết bị lên Firestore.');
        setTimeout(() => setNotice(null), 3000);
      }
    } catch (e) {
      console.error('Error assigning device:', e);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const ok = await adminUpdateUser(editingUser);
    if (ok) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
      setEditingUser(null);
      setNotice(`Đã cập nhật thông tin cho ${editingUser.fullName}`);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.fullName) return;

    const newId = `usr-${Date.now()}`;
    const user: AuthUser = {
      id: newId,
      username: newUserForm.email.split('@')[0],
      email: newUserForm.email,
      fullName: newUserForm.fullName,
      role: newUserForm.role || 'employee',
      department: newUserForm.department || 'Văn Phòng IoT',
      age: Number(newUserForm.age) || 28,
      gender: (newUserForm.gender as any) || 'male',
      height: Number(newUserForm.height) || 170,
      weight: Number(newUserForm.weight) || 65,
      maxSittingHours: Number(newUserForm.maxSittingHours) || 6,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      status: 'active',
      device: newUserForm.device || '',
      deviceId: newUserForm.device || '',
      createdAt: new Date().toISOString(),
    };

    const ok = await adminCreateUser(user);
    if (ok) {
      setUsers(prev => [...prev, user]);
      setIsAddingNew(false);
      setNewUserForm({
        fullName: '',
        email: '',
        role: 'employee',
        department: 'Văn Phòng IoT',
        age: 28,
        gender: 'male',
        height: 170,
        weight: 65,
        maxSittingHours: 6,
        device: '',
      });
      setNotice(`Đã tạo mới thành công tài khoản ${user.fullName}`);
      setTimeout(() => setNotice(null), 3500);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-[98vw] sm:w-[95vw] max-w-6xl max-h-[94vh] flex flex-col overflow-hidden text-slate-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                  Trung Tâm Quản Trị Tài Khoản & Giao Việc
                </h3>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Đồng bộ hai chiều với Firebase Firestore (collections: users, notifications)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 sm:px-6 pt-3 border-b border-slate-200 bg-white flex items-center gap-6 shrink-0">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`pb-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'accounts'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Tài Khoản Đã Đăng Nhập</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
              activeTab === 'accounts' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`pb-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Giao Việc & Gửi Thông Báo</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-800">
                {pendingCount} đang xử lý
              </span>
            )}
          </button>
        </div>

        {/* Notice Message */}
        {notice && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs flex items-center gap-2 animate-fadeIn shrink-0">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* TAB 1: ACCOUNTS LIST */}
        {activeTab === 'accounts' && (
          <>
            {/* Action Bar */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tài khoản theo tên, email, phòng ban..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={loadUsers}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
                </button>

                <button
                  onClick={() => setIsAddingNew(true)}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Tài Khoản</span>
                </button>
              </div>
            </div>

            {/* User List Table */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {isLoading ? (
                <div className="py-16 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                  <p className="text-xs">Đang tải danh sách tài khoản từ Firestore...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs">Không tìm thấy tài khoản nào phù hợp với tìm kiếm.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs bg-white">
                  <table className="w-full text-left text-xs border-collapse min-w-[780px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[240px]">Thành Viên</th>
                        <th className="py-3.5 px-4 whitespace-nowrap text-center w-36">Vai Trò</th>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[170px]">Thể Trạng & Tuổi</th>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[170px]">Phòng Ban</th>
                        <th className="py-3.5 px-4 whitespace-nowrap min-w-[150px]">Thiết Bị (DeviceId)</th>
                        <th className="py-3.5 px-4 whitespace-nowrap text-right pr-4 min-w-[200px]">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map(u => {
                        const isCurrent = u.id === currentUser.id || u.email === currentUser.email;
                        const isAdmin = u.role === 'admin' || u.role === 'manager';
                        const hM = (u.height || 170) / 100;
                        const bmiVal = ((u.weight || 65) / (hM * hM)).toFixed(1);

                        return (
                          <tr 
                            key={u.id} 
                            className={`hover:bg-slate-50/70 transition-colors ${isCurrent ? 'bg-indigo-50/30 font-medium' : ''}`}
                          >
                            {/* Member info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center font-bold text-slate-700 text-xs shadow-2xs">
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
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                        Hiện tại
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Role display (Static badge, no arbitrary role toggle) */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {isAdmin ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-indigo-50 text-indigo-700 border-indigo-200 shadow-2xs select-none">
                                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Admin</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-slate-100 text-slate-700 border-slate-200 select-none">
                                  <User className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Nhân viên</span>
                                </span>
                              )}
                            </td>

                            {/* Age & Biometrics */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-900 text-xs">
                                    {u.age || 28} tuổi
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                    BMI {bmiVal}
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-slate-500 block">
                                  {u.height || 170}cm • {u.weight || 65}kg
                                </span>
                              </div>
                            </td>

                            {/* Department */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                {u.department || 'Văn Phòng IoT'}
                              </span>
                            </td>

                            {/* Device ID / Gán Thiết Bị */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Radio className={`w-3.5 h-3.5 shrink-0 ${u.device ? 'text-indigo-600' : 'text-slate-400'}`} />
                                <select
                                  value={u.device || u.deviceId || ''}
                                  onChange={(e) => handleDeviceChange(u.id, e.target.value)}
                                  className={`h-8 px-2.5 py-1 text-xs font-mono rounded-lg border transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                    u.device
                                      ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 font-bold shadow-2xs'
                                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
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
                                {/* Direct Send Task Shortcut (Chỉ hiển thị cho Nhân viên, không hiển thị cho Admin) */}
                                {!isUserAdmin(u) && (
                                  <button
                                    type="button"
                                    onClick={() => handleAssignTaskShortcut(u)}
                                    title={`Giao việc / gửi thông báo riêng cho ${u.fullName}`}
                                    className="h-8 px-2.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center gap-1.5 transition cursor-pointer text-xs font-bold active:scale-95 shadow-2xs"
                                  >
                                    <Send className="w-3.5 h-3.5 text-sky-600" />
                                    <span>Giao việc</span>
                                  </button>
                                )}

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => setEditingUser(u)}
                                  title="Chỉnh sửa thông tin tài khoản"
                                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 flex items-center justify-center transition cursor-pointer active:scale-95"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete button with neat non-breaking confirm */}
                                {!isCurrent && (
                                  <>
                                    {confirmDeleteId === u.id ? (
                                      <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 px-2 h-8 rounded-lg shadow-2xs">
                                        <span className="text-[11px] font-bold text-rose-800">Xóa?</span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteUser(u.id)}
                                          className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition cursor-pointer"
                                        >
                                          Đồng ý
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold transition cursor-pointer"
                                        >
                                          Hủy
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(u.id)}
                                        title="Xóa tài khoản này"
                                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 flex items-center justify-center transition cursor-pointer active:scale-95"
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
            {/* Create Task Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Giao Việc Hoặc Gửi Thông Báo Mới</h4>
                  <p className="text-xs text-slate-500">Thông báo/Task sẽ lập tức hiển thị trực tiếp trên màn hình của người dùng qua Firebase</p>
                </div>
              </div>

              <form onSubmit={handleSendTaskSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Target user selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Người Nhận / Đối Tượng *
                    </label>
                    <select
                      value={newTaskForm.targetUserId}
                      onChange={e => setNewTaskForm({ ...newTaskForm, targetUserId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-slate-200 font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Loại Thông Báo *
                    </label>
                    <select
                      value={newTaskForm.type}
                      onChange={e => setNewTaskForm({ ...newTaskForm, type: e.target.value as NotificationType })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-slate-200 font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="task">📋 Giao việc / Task công việc</option>
                      <option value="health_alert">🧘 Nhắc nhở sức khỏe / Tư thế</option>
                      <option value="general">📢 Thông báo chung / Quy định</option>
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mức Độ Ưu Tiên *
                    </label>
                    <select
                      value={newTaskForm.priority}
                      onChange={e => setNewTaskForm({ ...newTaskForm, priority: e.target.value as NotificationPriority })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-slate-200 font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tiêu Đề Thông Báo / Tên Task *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Kiểm tra tư thế ngồi buổi chiều, hoặc Nộp báo cáo tuần"
                      value={newTaskForm.title}
                      onChange={e => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Optional Deadline */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Hạn Chót (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Trước 17:00 hôm nay"
                      value={newTaskForm.deadline}
                      onChange={e => setNewTaskForm({ ...newTaskForm, deadline: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nội Dung Chi Tiết / Hướng Dẫn *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Mô tả công việc cần làm, vị trí hoặc chỉ dẫn cụ thể cho thành viên..."
                    value={newTaskForm.content}
                    onChange={e => setNewTaskForm({ ...newTaskForm, content: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={isSendingTask}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingTask ? 'Đang gửi...' : 'Phát Thông Báo / Giao Việc'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* List of Sent Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Danh Sách Nhiệm Vụ & Thông Báo Đã Gửi</h4>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700">
                    {tasks.length}
                  </span>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs">
                  <button
                    onClick={() => setTaskFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      taskFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => setTaskFilter('pending')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      taskFilter === 'pending' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Đang xử lý
                  </button>
                  <button
                    onClick={() => setTaskFilter('completed')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      taskFilter === 'completed' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Đã hoàn thành
                  </button>
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <FileText className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                  <p className="text-xs">Chưa có thông báo hoặc nhiệm vụ nào trong mục này.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredTasks.map(t => {
                    const isCompleted = t.status === 'completed';
                    const isAck = t.status === 'acknowledged';

                    return (
                      <div 
                        key={t.id}
                        className={`p-3.5 rounded-xl border transition ${
                          isCompleted 
                            ? 'bg-slate-50/60 border-slate-200 text-slate-600' 
                            : t.priority === 'urgent'
                            ? 'bg-rose-50/40 border-rose-200'
                            : 'bg-white border-slate-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Priority Badge */}
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                t.priority === 'urgent' 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : t.priority === 'high' 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {t.priority === 'urgent' ? 'Khẩn cấp' : t.priority === 'high' ? 'Ưu tiên' : 'Thường'}
                              </span>

                              {/* Target user badge */}
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800">
                                Gửi: {t.targetUserName || (t.targetUserId === 'all' ? 'Tất cả' : t.targetUserId)}
                              </span>

                              {/* Status Badge */}
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isCompleted 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : isAck 
                                  ? 'bg-sky-100 text-sky-800' 
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {isCompleted ? '✓ Đã hoàn thành' : isAck ? 'Đang xử lý (Đã nhận)' : 'Chờ thực hiện'}
                              </span>
                            </div>

                            <h5 className={`text-xs sm:text-sm font-bold ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                              {t.title}
                            </h5>

                            <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                              {t.content}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                              <span>Gửi bởi: <b>{t.senderName}</b></span>
                              <span>•</span>
                              <span>{new Date(t.createdAt).toLocaleString('vi-VN')}</span>
                              {t.deadline && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-700 font-semibold">Hạn: {t.deadline}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start pt-1 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleToggleTaskStatus(t)}
                              title={isCompleted ? 'Đánh dấu chưa xong' : 'Đánh dấu đã hoàn thành'}
                              className={`h-7 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                                isCompleted 
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>{isCompleted ? 'Mở lại' : 'Hoàn thành'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteTask(t.id)}
                              title="Xóa thông báo này"
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 flex items-center justify-center transition cursor-pointer"
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

        {/* Footer info */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-center text-[11px] text-slate-500">
          Dữ liệu tài khoản & giao việc tự động lưu và đồng bộ tức thời với Cloud Firestore
        </div>
      </div>

      {/* Sub-modal: Edit User Profile */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                <span>Chỉnh Sửa Thông Tin: {editingUser.fullName}</span>
              </h4>
              <button
                onClick={() => setEditingUser(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và Tên</label>
                <input
                  type="text"
                  required
                  value={editingUser.fullName}
                  onChange={e => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Độ Tuổi</label>
                  <input
                    type="number"
                    value={editingUser.age || 28}
                    onChange={e => setEditingUser({ ...editingUser, age: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giới Tính</label>
                  <select
                    value={editingUser.gender || 'male'}
                    onChange={e => setEditingUser({ ...editingUser, gender: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chiều Cao (cm)</label>
                  <input
                    type="number"
                    value={editingUser.height || 170}
                    onChange={e => setEditingUser({ ...editingUser, height: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cân Nặng (kg)</label>
                  <input
                    type="number"
                    value={editingUser.weight || 65}
                    onChange={e => setEditingUser({ ...editingUser, weight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phòng Ban</label>
                <input
                  type="text"
                  value={editingUser.department || ''}
                  onChange={e => setEditingUser({ ...editingUser, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Gán Thiết Bị IoT (Device)</label>
                <select
                  value={editingUser.device || editingUser.deviceId || ''}
                  onChange={e => setEditingUser({ ...editingUser, deviceId: e.target.value, device: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                >
                  <option value="">Trống (Chưa gán)</option>
                  <option value="pi4_node_1">pi4_node_1</option>
                  <option value="pi4_node_2">pi4_node_2</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">Gán node thiết bị tương ứng để đồng bộ dữ liệu thời gian thực</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-modal: Add New User */}
      {isAddingNew && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>Thêm Tài Khoản Theo Dõi Sức Khỏe Mới</span>
              </h4>
              <button
                onClick={() => setIsAddingNew(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNew} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và Tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hoàng Minh Đức"
                  value={newUserForm.fullName}
                  onChange={e => setNewUserForm({ ...newUserForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Đăng Nhập *</label>
                <input
                  type="email"
                  required
                  placeholder="hoangduc@example.com"
                  value={newUserForm.email}
                  onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Độ Tuổi</label>
                  <input
                    type="number"
                    value={newUserForm.age || 28}
                    onChange={e => setNewUserForm({ ...newUserForm, age: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giới Tính</label>
                  <select
                    value={newUserForm.gender || 'male'}
                    onChange={e => setNewUserForm({ ...newUserForm, gender: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chiều Cao (cm)</label>
                  <input
                    type="number"
                    value={newUserForm.height || 170}
                    onChange={e => setNewUserForm({ ...newUserForm, height: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cân Nặng (kg)</label>
                  <input
                    type="number"
                    value={newUserForm.weight || 65}
                    onChange={e => setNewUserForm({ ...newUserForm, weight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phòng Ban</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Phòng Kế Toán / Thiết Kế"
                  value={newUserForm.department || ''}
                  onChange={e => setNewUserForm({ ...newUserForm, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Gán Thiết Bị IoT (Device)</label>
                <select
                  value={newUserForm.device || newUserForm.deviceId || ''}
                  onChange={e => setNewUserForm({ ...newUserForm, deviceId: e.target.value, device: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 font-mono"
                >
                  <option value="">Trống (Chưa gán)</option>
                  <option value="pi4_node_1">pi4_node_1</option>
                  <option value="pi4_node_2">pi4_node_2</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">Gán node thiết bị tương ứng để đồng bộ dữ liệu thời gian thực</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Thêm Tài Khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
