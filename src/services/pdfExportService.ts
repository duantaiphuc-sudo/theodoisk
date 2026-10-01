import jsPDF from 'jspdf';
import { TelemetryLog, EmployeeNodeStatus, AuthUser } from '../types';

export interface PDFExportData {
  currentUser?: AuthUser | null;
  historyLogs: TelemetryLog[];
  nodes?: EmployeeNodeStatus[];
  summary?: {
    totalLogs: number;
    avgBpm: number;
    avgSpo2: number;
    correctPosturePercent: number;
    totalAlerts: number;
  };
}

/**
 * Clean string for standard jsPDF core fonts (converts accented Vietnamese to readable plain text for crisp PDF rendering)
 */
function cleanAsciiText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Generate and download an executive health telemetry PDF report
 */
export function exportHealthReportToPDF(data: PDFExportData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const logs = data.historyLogs || [];
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  // Compute summary metrics if not provided
  let avgBpm = data.summary?.avgBpm || 0;
  let avgSpo2 = data.summary?.avgSpo2 || 0;
  let correctCount = 0;
  let standingCount = 0;
  let alertCount = 0;

  if (logs.length > 0) {
    const validBpmLogs = logs.filter(l => l.bpm > 0);
    const validSpo2Logs = logs.filter(l => l.spo2 > 0);
    
    if (validBpmLogs.length > 0) {
      avgBpm = Math.round(validBpmLogs.reduce((acc, cur) => acc + cur.bpm, 0) / validBpmLogs.length);
    }
    if (validSpo2Logs.length > 0) {
      const sumSpo2 = validSpo2Logs.reduce((acc, cur) => acc + cur.spo2, 0);
      avgSpo2 = Number((sumSpo2 / validSpo2Logs.length).toFixed(1));
    }
    correctCount = logs.filter(l => l.postureStatus === 0).length;
    standingCount = logs.filter(l => l.postureStatus === 5).length;
    alertCount = logs.filter(l => l.postureStatus === 1 || l.postureStatus === 3 || l.postureStatus === 4).length;
  } else {
    avgBpm = 0;
    avgSpo2 = 0;
    correctCount = 0;
    standingCount = 0;
    alertCount = 0;
  }

  const activePostureCount = correctCount + standingCount;
  const postureRate = logs.length > 0 ? Math.round((activePostureCount / logs.length) * 100) : 100;
  const targetUser = data.currentUser;
  const accountName = targetUser?.fullName || targetUser?.username || 'Nhan vien theo doi';
  const accountEmail = targetUser?.email || 'user@healthiot.local';
  const accountDept = targetUser?.department || 'Bo phan lam viec van phong';
  const accountRole = targetUser?.role === 'admin' ? 'Quan tri vien (Admin)' : (targetUser?.role === 'manager' ? 'Quan ly (Manager)' : 'Nhan vien (Employee)');

  // --- 1. HEADER BRANDING ---
  // Blue decorative top bar
  doc.setFillColor(14, 116, 144); // Sky 700
  doc.rect(0, 0, 210, 8, 'F');

  // Title Box
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('BAO CAO HO SO SUC KHOE & TU THE CONG THAI HOC IOT', 105, 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text('He thong giam sat sinh trac hoc thoi gian thuc tu Raspberry Pi 4 & Firebase Firestore', 105, 26, { align: 'center' });

  // Divider line
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.5);
  doc.line(15, 30, 195, 30);

  // --- 2. REPORT METADATA SECTION ---
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  doc.setFont('helvetica', 'bold');
  doc.text('NGAY XUAT BAO CAO:', 16, 37);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dateStr} luc ${timeStr}`, 58, 37);

  doc.setFont('helvetica', 'bold');
  doc.text('HO SO TAI KHOAN:', 16, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(`${cleanAsciiText(accountName)} - ${cleanAsciiText(accountRole)}`, 58, 43);

  doc.setFont('helvetica', 'bold');
  doc.text('EMAIL & PHONG BAN:', 115, 37);
  doc.setFont('helvetica', 'normal');
  doc.text(`${cleanAsciiText(accountEmail)} | ${cleanAsciiText(accountDept)}`, 155, 37);

  doc.setFont('helvetica', 'bold');
  doc.text('THIET BI & CLOUD:', 115, 43);
  doc.setFont('helvetica', 'normal');
  doc.text('Raspberry Pi 4 • Firebase Firestore', 155, 43);

  // --- 3. EXECUTIVE KPI CARDS ---
  // Background container
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.roundedRect(15, 48, 180, 22, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(15, 48, 180, 22, 2, 2, 'D');

  // KPI 1: Nhịp tim TB
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NHIP TIM TRUNG BINH', 20, 55);
  doc.setFontSize(14);
  doc.setTextColor(225, 29, 72); // Rose 600
  doc.text(`${avgBpm} BPM`, 20, 64);

  // KPI 2: SpO2 TB
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NONG DO OXY (SpO2)', 66, 55);
  doc.setFontSize(14);
  doc.setTextColor(2, 132, 199); // Sky 600
  doc.text(`${avgSpo2}%`, 66, 64);

  // KPI 3: Tỷ lệ tư thế chuẩn
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TU THE CONG THAI HOC', 112, 55);
  doc.setFontSize(14);
  doc.setTextColor(5, 150, 105); // Emerald 600
  doc.text(`${postureRate}% Dat chuan`, 112, 64);

  // KPI 4: Cảnh báo
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('CANH BAO SAI/NGOI LAU', 158, 55);
  doc.setFontSize(14);
  doc.setTextColor(217, 119, 6); // Amber 600
  doc.text(`${alertCount} lan`, 158, 64);

  // --- 4. SECTION: NHAN VIEN & THIET BI IOT ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. DANH SACH THIET BI IOT & NHAN VIEN THEO DOI', 15, 78);

  // Table Header
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.rect(15, 82, 180, 7, 'F');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('STT', 18, 86.5);
  doc.text('TEN NHAN VIEN', 28, 86.5);
  doc.text('THIET BI NODE', 65, 86.5);
  doc.text('HIEN DIEN', 100, 86.5);
  doc.text('TU THE NGOI', 130, 86.5);
  doc.text('THOI GIAN NGOI', 165, 86.5);

  const employeeRows = (data.nodes && data.nodes.length > 0)
    ? data.nodes.map(n => ({
        name: n.name,
        node: n.device,
        presence: n.presence === 'Present' ? 'Tai ban (Present)' : 'Vang mat (Away)',
        posture: n.postureText,
        sitting: `${n.sittingMinutes} phut`
      }))
    : (data.currentUser ? [
        {
          name: data.currentUser.fullName || data.currentUser.username,
          node: 'pi4_node_1',
          presence: 'Tai ban (Present)',
          posture: 'Dung',
          sitting: '0 phut'
        }
      ] : []);

  let currentY = 93;
  employeeRows.forEach((row, idx) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);

    doc.text(String(idx + 1), 18, currentY);
    doc.text(cleanAsciiText(row.name), 28, currentY);
    doc.text(row.node, 65, currentY);
    doc.text(cleanAsciiText(row.presence), 100, currentY);
    doc.text(cleanAsciiText(row.posture), 130, currentY);
    doc.text(cleanAsciiText(row.sitting), 165, currentY);

    // subtle row line
    doc.setDrawColor(241, 245, 249);
    doc.line(15, currentY + 2.5, 195, currentY + 2.5);
    currentY += 7;
  });

  // --- 5. SECTION: LICH SU BAN GHI TELEMETRY TU FIREBASE ---
  currentY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. LICH SU CHI TIET CAC BAN GHI DO DAC (FIREBASE CLOUD LOGS)', 15, currentY);

  currentY += 4;
  doc.setFillColor(241, 245, 249);
  doc.rect(15, currentY, 180, 7, 'F');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('THOI GIAN', 18, currentY + 4.5);
  doc.text('NHIP TIM', 55, currentY + 4.5);
  doc.text('SPO2 (%)', 85, currentY + 4.5);
  doc.text('TU THE GHI NHAN', 115, currentY + 4.5);
  doc.text('CANH BAO / TRANG THAI', 155, currentY + 4.5);

  currentY += 10;

  // Render top 15 most recent logs
  const displayLogs = logs.slice(0, 15);
  if (displayLogs.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Chua co ban ghi nao trong lich su Firebase hoac he thong dang cho dong bo...', 20, currentY);
    currentY += 8;
  } else {
    displayLogs.forEach(log => {
      const timeStrDisplay = log.dateTimeFormatted || `${log.dateFormatted || ''} ${log.timeFormatted || ''}`;
      const bpmDisplay = log.bpm > 0 ? `${log.bpm} bpm` : '--';
      const spo2Display = log.spo2 > 0 ? `${log.spo2}%` : '--';
      const postureDisplay = cleanAsciiText(log.postureLabel || 'Chua co');
      const warningDisplay = log.postureStatus === 1 ? 'Sai tu the' : (log.postureStatus === 3 ? 'Sai lau (>30s)' : (log.postureStatus === 4 ? 'Ngoi lau (>60p)' : 'Binh thuong'));

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);

      doc.text(cleanAsciiText(timeStrDisplay).substring(0, 18), 18, currentY);
      doc.text(bpmDisplay, 55, currentY);
      doc.text(spo2Display, 85, currentY);
      doc.text(postureDisplay.substring(0, 22), 115, currentY);
      doc.text(cleanAsciiText(warningDisplay), 155, currentY);

      doc.setDrawColor(241, 245, 249);
      doc.line(15, currentY + 2, 195, currentY + 2);
      currentY += 6;
    });
  }

  // --- 6. SECTION: KHUYEN NGHI Y TE CONG THAI HOC ---
  currentY += 4;
  if (currentY > 255) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(240, 253, 250); // Teal 50
  doc.roundedRect(15, currentY, 180, 20, 2, 2, 'F');
  doc.setDrawColor(204, 251, 241);
  doc.roundedRect(15, currentY, 180, 20, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 118, 110); // Teal 700
  doc.text('3. KHUYEN NGHI CONG THAI HOC & AN TOAN LAO DONG CHO VAN PHONG:', 20, currentY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(19, 78, 74);
  doc.text('- Quy tac 45-5: Sau moi 45 phut ngoi lam viec lien tuc, dung day vuon vai di lai it nhat 5 phut.', 20, currentY + 10);
  doc.text('- Tu the man hinh: Giu mat song song 1/3 phia tren man hinh, goc nghieng co khong qua 20 do.', 20, currentY + 14);
  doc.text('- Chi so sinh trac: Nhap tim duy tri 60-90 BPM luc ngoi, SpO2 tren 95% dam bao cung cap du oxy nao bo.', 20, currentY + 18);

  // --- 7. FOOTER & APPROVAL SIGNATURE ---
  currentY += 25;
  if (currentY > 265) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('NGUOI LAP BAO CAO', 35, currentY, { align: 'center' });
  doc.text('XAC NHAN BAN QUAN LY Y TE IOT', 160, currentY, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('(Ky va ghi ro ho ten)', 35, currentY + 4.5, { align: 'center' });
  doc.text('(Duyet tu dong Firebase)', 160, currentY + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanAsciiText(accountName), 35, currentY + 16, { align: 'center' });
  doc.text('HE THONG IOT HEALTHOFFICE', 160, currentY + 16, { align: 'center' });

  // Page numbering footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`HealthOffice IoT Telemetry Report - Ma ho so: HTH-${now.getTime().toString().slice(-6)} - Trang 1/1`, 105, 290, { align: 'center' });

  // Save the PDF file
  const fileName = `Bao_Cao_Suc_Khoe_IoT_Firebase_${now.toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
