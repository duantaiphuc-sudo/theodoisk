import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Image as ImageIcon, 
  Sparkles, 
  Sun, 
  Moon, 
  Sliders, 
  RotateCcw,
  ExternalLink
} from 'lucide-react';

export interface WallpaperOption {
  id: string;
  name: string;
  category: string;
  url: string;
  thumbnail: string;
  theme: 'light' | 'dark' | 'auto';
  description: string;
}

export const WALLPAPER_PRESETS: WallpaperOption[] = [
  {
    id: 'office-default',
    name: 'Văn Phòng Công Nghệ',
    category: 'Mặc định',
    url: '/nenweb.png',
    thumbnail: '/nenweb.png',
    theme: 'light',
    description: 'Không gian làm việc công thái học chuẩn IoT hiện đại'
  },
  {
    id: 'sakura-spring',
    name: 'Hoa Anh Đào',
    category: 'Thư giãn',
    url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Vườn hoa anh đào mùa xuân Nhật Bản dịu dàng'
  },
  {
    id: 'zen-garden',
    name: 'Khu Vườn Zen',
    category: 'Tĩnh tâm',
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Rừng trúc xanh mát và sỏi thiền cân bằng cảm xúc'
  },
  {
    id: 'ocean-waves',
    name: 'Biển Xanh Nhiệt Đới',
    category: 'Năng lượng',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Sóng biển xanh ngọc lam giúp giảm căng thẳng thị giác'
  },
  {
    id: 'aurora-borealis',
    name: 'Cực Quang Phương Bắc',
    category: 'Tập trung',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=400&q=70',
    theme: 'dark',
    description: 'Dải sáng Aurora huyền ảo trên nền trời đêm tuyết'
  },
  {
    id: 'rainy-cafe',
    name: 'Cafe Ngày Mưa Lofi',
    category: 'Ấm áp',
    url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=400&q=70',
    theme: 'dark',
    description: 'Khung cửa sổ quán cafe ngắm mưa nhẹ nhàng yên tĩnh'
  },
  {
    id: 'lotus-night',
    name: 'Đêm Sao Hồ Sen (Lofi Cat)',
    category: 'Chill',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=400&q=70',
    theme: 'dark',
    description: 'Bầu trời sao đêm lấp lánh phản chiếu mặt nước tĩnh lặng'
  },
  {
    id: 'misty-forest',
    name: 'Rừng Thông Sương Mù',
    category: 'Thiên nhiên',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Không khí trong lành buổi sớm giữa rừng thông bạt ngàn'
  }
];

interface WallpaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWallpaperUrl: string;
  onSelectWallpaper: (url: string) => void;
  blurIntensity: number;
  onChangeBlur: (blur: number) => void;
  overlayOpacity: number;
  onChangeOpacity: (opacity: number) => void;
}

export const WallpaperModal: React.FC<WallpaperModalProps> = ({
  isOpen,
  onClose,
  currentWallpaperUrl,
  onSelectWallpaper,
  blurIntensity,
  onChangeBlur,
  overlayOpacity,
  onChangeOpacity,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');

  if (!isOpen) return null;

  const categories = ['Tất cả', 'Mặc định', 'Thư giãn', 'Tĩnh tâm', 'Năng lượng', 'Tập trung', 'Chill', 'Thiên nhiên'];

  const filteredPresets = selectedCategory === 'Tất cả' 
    ? WALLPAPER_PRESETS 
    : WALLPAPER_PRESETS.filter(p => p.category === selectedCategory);

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://') && !customUrl.startsWith('/')) {
      setCustomError('Vui lòng nhập đường dẫn URL ảnh hợp lệ (https://...)');
      return;
    }
    setCustomError('');
    onSelectWallpaper(customUrl.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-3xl bg-slate-900/90 border border-white/20 shadow-2xl backdrop-blur-xl text-white overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Không Gian & Hình Nền Dashboard
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                  Glassmorphism
                </span>
              </h2>
              <p className="text-xs text-slate-400">Chọn ảnh nền tự nhiên để tạo cảm hứng và giảm mỏi mắt khi làm việc</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-teal-400 text-slate-950 shadow-[0_0_12px_rgba(45,212,191,0.4)]'
                    : 'bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Wallpaper Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {filteredPresets.map((preset) => {
              const isSelected = currentWallpaperUrl === preset.url;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectWallpaper(preset.url)}
                  className={`group relative rounded-2xl overflow-hidden aspect-video sm:aspect-4/3 text-left transition-all border cursor-pointer ${
                    isSelected 
                      ? 'border-teal-400 ring-2 ring-teal-400/50 shadow-lg scale-[1.02]' 
                      : 'border-white/10 hover:border-white/30 hover:scale-[1.01]'
                  }`}
                >
                  <img 
                    src={preset.thumbnail} 
                    alt={preset.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent p-2.5 flex flex-col justify-end">
                    <span className="text-xs font-bold text-white line-clamp-1">{preset.name}</span>
                    <span className="text-[10px] text-teal-300/90 line-clamp-1">{preset.category}</span>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-teal-400 text-slate-950 flex items-center justify-center shadow-md">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Glass & Transparency Adjustments */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-teal-300" />
                <span>Tùy Chỉnh Độ Kính Mờ (Glassmorphism)</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onChangeBlur(1);
                  onChangeOpacity(40);
                }}
                className="text-[11px] text-teal-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Mặc định</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Blur Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Độ nhòe hình nền (Blur)</span>
                  <span className="font-mono text-teal-300 font-bold">{blurIntensity}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  value={blurIntensity}
                  onChange={(e) => onChangeBlur(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
                />
              </div>

              {/* Tint Opacity Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Độ trong suốt nền kính</span>
                  <span className="font-mono text-teal-300 font-bold">{overlayOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="5"
                  value={overlayOpacity}
                  onChange={(e) => onChangeOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
                />
              </div>
            </div>
          </div>

          {/* Custom Image URL Form */}
          <form onSubmit={handleApplyCustomUrl} className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Dùng hình nền riêng (Link URL ảnh Online):</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  setCustomError('');
                }}
                placeholder="https://example.com/hinh-nen-cua-ban.jpg"
                className="flex-1 px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-teal-400 transition"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap shadow-xs"
              >
                Áp dụng
              </button>
            </div>
            {customError && <p className="text-xs text-rose-400 mt-1">{customError}</p>}
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Lựa chọn được lưu tự động trên trình duyệt của bạn
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
