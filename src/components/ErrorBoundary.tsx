import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.removeItem('theodoisk_authenticated_user_v1');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 text-slate-900 font-sans">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                  Đã xảy ra sự cố hiển thị
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Ứng dụng gặp lỗi ngoài dự kiến và đã được chặn an toàn thay vì màn hình trắng.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 break-words max-h-40 overflow-y-auto">
                <p className="font-bold text-rose-700">{this.state.error.name}: {this.state.error.message}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold shadow-xs transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="flex-1 min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-sm font-semibold shadow-xs transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất & Xóa cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
