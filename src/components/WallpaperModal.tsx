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
    id: 'tactile-cream',
    name: 'Kem Sáng Tối Giản (Tactile Clean)',
    category: 'Mặc định',
    url: 'tactile-cream',
    thumbnail: '',
    theme: 'light',
    description: 'Nền giấy kem ấm #FDFBF7 & thẻ trắng viền đen sắc nét đồng bộ toàn web'
  },
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
    id: 'sunset-beach',
    name: 'Bãi Biển Hoàng Hôn Vàng',
    category: 'Thư giãn',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Bờ biển sóng vỗ ánh hoàng hôn cam ấm áp'
  },
  {
    id: 'fuji-sunset',
    name: 'Núi Phú Sĩ Hoàng Hôn',
    category: 'Tĩnh tâm',
    url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Đỉnh núi tuyết Phú Sĩ soi bóng hồ trong ráng chiều pastel'
  },
  {
    id: 'swiss-alps-lake',
    name: 'Hồ Nước Alps Thụy Sĩ',
    category: 'Năng lượng',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Dãy núi đá hùng vĩ và mặt hồ xanh ngọc trong vắt'
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
    id: 'zen-bamboo',
    name: 'Rừng Trúc Sagano Kyoto',
    category: 'Tĩnh tâm',
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Rừng trúc xanh mát và không gian thiền định cân bằng mắt'
  },
  {
    id: 'golden-gate-mist',
    name: 'Cầu Cổng Vàng Sương Mù',
    category: 'Tập trung',
    url: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Sương mù bảng lảng sớm mai giúp giảm mỏi mắt khi làm việc'
  },
  {
    id: 'lavender-field',
    name: 'Cánh Đồng Hoa Oải Hương',
    category: 'Thư giãn',
    url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Sắc tím lavender Provence xoa dịu thần kinh căng thẳng'
  },
  {
    id: 'waterfall-nature',
    name: 'Thác Nước Trong Lành',
    category: 'Thiên nhiên',
    url: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Dòng thác mát lành giữa đại ngàn rừng xanh'
  },
  {
    id: 'misty-forest',
    name: 'Rừng Thông Sương Mù',
    category: 'Thiên nhiên',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=400&q=70',
    theme: 'light',
    description: 'Không khí trong lành buổi sớm giữa rừng thông bạt ngàn'
  },
  {
    id: 'pastel-sunset-sky',
    name: 'Hoàng Hôn Tím Pastel',
    category: 'Chill',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=2000&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=70',
    theme: 'dark',
    description: 'Bầu trời ráng mây tím hồng mộng mơ'
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
  glassTone: 'light' | 'dark';
  onChangeGlassTone: (tone: 'light' | 'dark') => void;
  cardOpacity: number;
  onChangeCardOpacity: (opacity: number) => void;
  onResetDefaults?: () => void;
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
  glassTone,
  onChangeGlassTone,
  cardOpacity,
  onChangeCardOpacity,
  onResetDefaults,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white border-2 border-slate-800 shadow-[0_6px_0_#1E293B] text-slate-900 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b-2 border-slate-800 bg-[#FDFBF7]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#BAE0EC] text-slate-900 border-2 border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                Giao Diện &amp; Hình Nền Dashboard
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B2F5BE] text-slate-900 border-[1.5px] border-slate-800">
                  Tactile Clean
                </span>
              </h2>
              <p className="text-xs text-slate-600 font-medium">Chuyển đổi chế độ Sáng / Tối hoặc chọn ảnh nền không gian làm việc</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onResetDefaults && (
              <button
                type="button"
                onClick={onResetDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl tactile-btn-white text-xs font-bold cursor-pointer"
                title="Khôi phục giao diện Tactile Clean mặc định"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mặc định</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
          
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer border-[1.5px] ${
                  selectedCategory === cat
                    ? 'bg-[#16B364] text-white border-slate-900 shadow-[0_2px_0_#0F172A]'
                    : 'bg-[#FAF7F0] text-slate-700 border-slate-800 hover:bg-[#BAE0EC]'
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
              const isCreamCard = preset.url === 'tactile-cream';
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectWallpaper(preset.url)}
                  className={`group relative rounded-2xl overflow-hidden aspect-video sm:aspect-4/3 text-left transition-all border-2 cursor-pointer ${
                    isSelected 
                      ? 'border-[#16B364] ring-2 ring-[#16B364]/40 shadow-[0_3px_0_#16B364]' 
                      : 'border-slate-800 shadow-[0_3px_0_#1E293B] hover:-translate-y-0.5'
                  }`}
                >
                  {isCreamCard ? (
                    <div className="w-full h-full bg-[#FDFBF7] flex flex-col items-center justify-center gap-1.5 p-3">
                      <div className="w-12 h-8 rounded-lg bg-white border-2 border-slate-800 shadow-[0_2px_0_#1E293B] flex items-center justify-center">
                        <span className="w-5 h-2 rounded-full bg-[#16B364]" />
                      </div>
                      <span className="text-[11px] font-extrabold text-slate-900 text-center leading-tight">{preset.name}</span>
                    </div>
                  ) : (
                    <>
                      <img 
                        src={preset.thumbnail} 
                        alt={preset.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent p-2.5 flex flex-col justify-end">
                        <span className="text-xs font-bold text-white line-clamp-1">{preset.name}</span>
                        <span className="text-[10px] text-[#B2F5BE] font-semibold line-clamp-1">{preset.category}</span>
                      </div>
                    </>
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#16B364] border-[1.5px] border-slate-900 text-white flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Mode & Transparency Adjustments */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border-2 border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#16B364]" />
                <span>Chế Độ Hiển Thị (Sáng / Tối &amp; Nền)</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectWallpaper('tactile-cream');
                  onChangeBlur(0);
                  onChangeOpacity(40);
                  onChangeGlassTone('light');
                  onChangeCardOpacity(100);
                }}
                className="text-[11px] font-bold text-[#16B364] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Mặc định sáng</span>
              </button>
            </div>

            {/* 1. Light vs Dark Tone Selector */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600">Tông màu chủ đạo toàn hệ thống:</span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onChangeGlassTone('light')}
                  className={`py-2.5 px-3 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
                    glassTone === 'light'
                      ? 'bg-[#B2F5BE] border-slate-900 text-slate-900 shadow-[0_3px_0_#0F172A]'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-slate-800'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-600" />
                  <span>Tactile Sáng (Khuyên dùng)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeGlassTone('dark')}
                  className={`py-2.5 px-3 rounded-xl border-2 text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
                    glassTone === 'dark'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-[0_3px_0_#020617]'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-slate-800'
                  }`}
                >
                  <Moon className="w-4 h-4 text-sky-400" />
                  <span>Tactile Tối (Dark Mode)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-700 font-semibold">
                  <span>Độ đậm thẻ</span>
                  <span className="font-mono text-[#16B364] font-bold">{cardOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="5"
                  value={cardOpacity}
                  onChange={(e) => onChangeCardOpacity(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#16B364]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-700 font-semibold">
                  <span>Độ nhòe ảnh nền</span>
                  <span className="font-mono text-[#16B364] font-bold">{blurIntensity}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  value={blurIntensity}
                  onChange={(e) => onChangeBlur(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#16B364]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-700 font-semibold">
                  <span>Lớp phủ nền</span>
                  <span className="font-mono text-[#16B364] font-bold">
                    {overlayOpacity === 0 ? '0% (Rõ nét)' : `${overlayOpacity}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  step="5"
                  value={overlayOpacity}
                  onChange={(e) => onChangeOpacity(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#16B364]"
                />
              </div>
            </div>
          </div>

          {/* Custom Image URL Form */}
          <form onSubmit={handleApplyCustomUrl} className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
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
                className="flex-1 px-3.5 py-2 rounded-xl bg-white border-2 border-slate-800 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#16B364] transition"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl tactile-btn-primary font-extrabold text-xs cursor-pointer whitespace-nowrap"
              >
                Áp dụng
              </button>
            </div>
            {customError && <p className="text-xs text-rose-600 font-semibold mt-1">{customError}</p>}
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t-2 border-slate-800 bg-[#FDFBF7] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onResetDefaults && (
              <button
                type="button"
                onClick={onResetDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl tactile-btn-secondary text-xs font-extrabold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục mặc định ban đầu</span>
              </button>
            )}
            <span className="text-[11px] text-slate-600 font-medium hidden sm:inline">
              Lựa chọn được lưu tự động trên trình duyệt
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl tactile-btn-white font-extrabold text-xs cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
