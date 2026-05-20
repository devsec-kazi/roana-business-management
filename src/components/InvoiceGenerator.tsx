import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp, 
  getDocs, 
  where,
  doc,
  runTransaction,
  getDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from './ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { 
  Plus, 
  Trash2, 
  Download, 
  FileText, 
  Calculator, 
  User, 
  Store,
  Loader2,
  Search,
  ShoppingBag,
  CreditCard,
  Receipt,
  History,
  ArrowLeft,
  Crown,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

// Extend jsPDF with autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface Customer {
  id: string;
  customerId: string;
  name: string;
  address: string;
  mobile: string;
  email: string;
  type?: 'VIP' | 'Regular';
  group?: string;
}

interface InvoiceItem {
  id: string;
  product: string;
  category: string;
  quantity: number;
  costPerProduct: number;
  total: number;
}

interface Invoice {
  id: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  customerType?: 'VIP' | 'Regular';
  date: Timestamp;
  items: Omit<InvoiceItem, 'id'>[];
  totalAmount: number;
  paymentMethod: string;
  advancePercentage?: number;
  advanceAmount?: number;
  dueAmount?: number;
  paymentStatus?: 'Paid' | 'Due';
}

const PRODUCT_CATEGORIES = [
  "Gown full set",
  "Gown",
  "Stole",
  "Cap",
  "Hood",
  "jute Bag",
  "Corporate gift"
  "Gown+Cap" 
  "Stole+Cap"
  "Gown+Hood+Cap"
  "Gown+Uttoriyo+Cap"
  "3 Part Set"
  "4 Part Set"
];

export function InvoiceGenerator({ 
  initialView = 'create',
  preSelectedCustomer = null,
  onClearPreSelected
}: { 
  initialView?: 'create' | 'history',
  preSelectedCustomer?: Customer | null,
  onClearPreSelected?: () => void
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState('Loading...');
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', product: '', category: PRODUCT_CATEGORIES[0], quantity: 1, costPerProduct: 0, total: 0 }
  ]);
  const [loading, setLoading] = useState(false);
  const [isGeneratingNo, setIsGeneratingNo] = useState(true);
  const [view, setView] = useState<'create' | 'history'>(initialView);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'VIP' | 'Regular'>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'Paid' | 'Due'>('all');
  const [advancePercentage, setAdvancePercentage] = useState<number>(25);
  const [advanceMode, setAdvanceMode] = useState<'percent' | 'manual'>('percent');
  const [manualAdvanceAmount, setManualAdvanceAmount] = useState<number>(0);
  const [bkashNumber, setBkashNumber] = useState('01892799997');
  const [paymentInstructions, setPaymentInstructions] = useState("Please use 'Make Payment' option in your bKash app.");
  const [paymentNote, setPaymentNote] = useState('Thank you!');

  useEffect(() => {
    const fetchAppSettings = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'app'));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setBkashNumber(data.bkashNumber || '01892799997');
          setPaymentInstructions(data.paymentInstructions || "Please use 'Make Payment' option in your bKash app.");
          setPaymentNote(data.paymentNote || 'Thank you!');
        }
      } catch (err) {
        console.error("Error fetching app settings:", err);
      }
    };
    fetchAppSettings();
  }, []);

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomerId(preSelectedCustomer.customerId);
      setCustomerSearch(preSelectedCustomer.name);
      onClearPreSelected?.();
    }
  }, [preSelectedCustomer]);

  // Close customer search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.customer-search-container')) {
        setShowCustomerResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const qCustomers = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customerData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customerData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'customers');
    });

    const unsubscribeInvoices = onSnapshot(
      query(collection(db, 'invoices'), orderBy('date', 'desc')), 
      (snapshot) => {
        const invoiceData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Invoice[];
        setInvoices(invoiceData);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'invoices');
      }
    );

    generateNextInvoiceNo();

    return () => {
      unsubscribeCustomers();
      unsubscribeInvoices();
    };
  }, []);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);

  const generateNextInvoiceNo = async () => {
    setIsGeneratingNo(true);
    try {
      // Fetch settings for prefix
      const settingsRef = doc(db, 'settings', 'app');
      const settingsSnap = await getDoc(settingsRef);
      const prefix = settingsSnap.exists() ? settingsSnap.data().invoicePrefix : 'ROGG';
      
      const isVIP = selectedCustomer?.type === 'VIP';
      
      if (isVIP && selectedCustomer) {
        const folderName = selectedCustomer.name.toLowerCase().replace(/\s+/g, '-');
        const vipCounterRef = doc(db, 'vip_counters', folderName);
        const vipCounterSnap = await getDoc(vipCounterRef);
        
        let nextNo = 1;
        if (vipCounterSnap.exists()) {
          nextNo = vipCounterSnap.data().lastNo + 1;
        }
        
        setInvoiceNo(`${prefix}-VIP-${folderName}-${nextNo.toString().padStart(4, '0')}`);
      } else {
        const counterRef = doc(db, 'counters', 'invoices');
        const counterSnap = await getDoc(counterRef);
        
        let nextNo = 1;
        if (counterSnap.exists()) {
          nextNo = counterSnap.data().lastNo + 1;
        }
        
        setInvoiceNo(`${prefix}-${nextNo.toString().padStart(4, '0')}`);
      }
    } catch (error) {
      console.error("Error generating invoice no:", error);
      setInvoiceNo(`ROGG-${Date.now().toString().slice(-4)}`);
    } finally {
      setIsGeneratingNo(false);
    }
  };

  useEffect(() => {
    if (selectedCustomerId) {
      generateNextInvoiceNo();
    }
  }, [selectedCustomerId]);

  const addItem = () => {
    const lastCategory = items.length > 0 ? items[items.length - 1].category : PRODUCT_CATEGORIES[0];
    setItems([...items, { 
      id: Date.now().toString(), 
      product: '', 
      category: lastCategory, 
      quantity: 1, 
      costPerProduct: 0, 
      total: 0 
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        // Auto-calculate total as user types
        const qty = field === 'quantity' ? Number(value) : Number(item.quantity);
        const price = field === 'costPerProduct' ? Number(value) : Number(item.costPerProduct);
        updatedItem.total = qty * price;
        return updatedItem;
      }
      return item;
    }));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  const calculatedAdvanceAmount = advanceMode === 'percent'
    ? Math.round((totalAmount * advancePercentage) / 100)
    : manualAdvanceAmount;

  const calculatedDueAmount = Math.max(0, totalAmount - calculatedAdvanceAmount);

  const calculatedAdvancePercentage = advanceMode === 'percent'
    ? advancePercentage
    : (totalAmount > 0 ? Math.round((manualAdvanceAmount / totalAmount) * 100) : 0);

  const handleAdvanceModeChange = (mode: 'percent' | 'manual') => {
    setAdvanceMode(mode);
    if (mode === 'manual') {
      const currentCalculated = Math.round((totalAmount * advancePercentage) / 100);
      setManualAdvanceAmount(currentCalculated);
    } else {
      if (totalAmount > 0) {
        const calculatedPercentage = Math.round((manualAdvanceAmount / totalAmount) * 100);
        setAdvancePercentage(Math.min(100, Math.max(0, calculatedPercentage)));
      }
    }
  };

  const selectedCustomer = customers.find(c => c.customerId === selectedCustomerId);

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete));
      toast.success("Invoice record deleted successfully");
      setIsDeleteModalOpen(false);
      setInvoiceToDelete(null);
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast.error("Failed to delete invoice");
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      await updateDoc(doc(db, 'invoices', id), {
        paymentStatus: 'Paid',
        dueAmount: 0
      });
      toast.success("Invoice marked as Paid");
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("Failed to update invoice");
    }
  };

  const generatePDF = async (invoiceData?: Invoice) => {
    const currentInvoiceNo = invoiceData ? invoiceData.invoiceNo : invoiceNo;
    const currentCustomer = invoiceData 
      ? customers.find(c => c.customerId === invoiceData.customerId) 
      : selectedCustomer;
    const currentItems = invoiceData ? invoiceData.items : items;
    const currentTotal = invoiceData ? invoiceData.totalAmount : totalAmount;
    const currentDate = invoiceData ? (invoiceData.date instanceof Timestamp ? invoiceData.date.toDate() : invoiceData.date) : new Date();

    if (!currentCustomer) {
      toast.error("Customer information missing");
      return false;
    }

    try {
      const pdfDoc = new jsPDF();
      
      // Fetch dynamic settings
      const settingsRef = doc(db, 'settings', 'app');
      const settingsSnap = await getDoc(settingsRef);
      const appSettings = settingsSnap.exists() ? settingsSnap.data() : {
        companyName: "Roana Gown & Glory",
        companyAddress: "Mirpur 12, Dhaka, Bangladesh",
        bkashNumber: "01892799997",
        companyLogo: "",
        bkashLogo: ""
      };
      
      const companyName = appSettings.companyName;
      const companyAddress = appSettings.companyAddress;
      const bkashNumber = appSettings.bkashNumber;
      const companyLogo = appSettings.companyLogo;
      const bkashLogo = appSettings.bkashLogo;

      // Header - Golden Premium Style
      pdfDoc.setFillColor(197, 160, 40); // Rich Gold #C5A028
      pdfDoc.rect(0, 0, 210, 65, 'F');
      
      // Decorative Border
      pdfDoc.setFillColor(255, 255, 255); // White
      pdfDoc.rect(0, 65, 210, 1, 'F');
      
      if (companyLogo) {
        try {
          pdfDoc.addImage(companyLogo, 'PNG', 15, 12, 40, 40);
        } catch (e) {
          console.error("Error adding logo to PDF:", e);
          pdfDoc.setFillColor(255, 255, 255);
          pdfDoc.circle(35, 32, 18, 'F');
          pdfDoc.setTextColor(0, 0, 0);
          pdfDoc.setFontSize(22);
          pdfDoc.setFont("helvetica", "bold");
          pdfDoc.text(companyName.charAt(0), 35, 35, { align: 'center' });
        }
      } else {
        pdfDoc.setFillColor(255, 255, 255);
        pdfDoc.circle(35, 32, 18, 'F');
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.setFontSize(22);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(companyName.charAt(0), 35, 35, { align: 'center' });
      }

      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(34);
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.text(companyName.toUpperCase(), 120, 28, { align: 'center' });
      
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(11);
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.text(companyAddress, 120, 38, { align: 'center' });
      pdfDoc.text(`Phone: ${bkashNumber} | Email: roanagownglory@gmail.com`, 120, 45, { align: 'center' });
      pdfDoc.text(`Web: www.roanagownglory.com`, 120, 52, { align: 'center' });

      // Invoice Info Header
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.setFontSize(32);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("SALES MEMO", 15, 90);
      
      pdfDoc.setFontSize(11);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(`INVOICE NO:`, 15, 102);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text(currentInvoiceNo, 45, 102);
      
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(`ISSUE DATE:`, 15, 108);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text(format(currentDate, 'PPP').toUpperCase(), 45, 108);
      
      if (currentCustomer?.type === 'VIP') {
        // VIP Badge with Icon
        pdfDoc.setFillColor(0, 0, 0);
        pdfDoc.rect(15, 114, 45, 10, 'F');
        
        // Add a small star icon (drawn with lines)
        const starX = 20;
        const starY = 119;
        pdfDoc.setDrawColor(255, 255, 255);
        pdfDoc.setLineWidth(0.5);
        // Simple star shape
        pdfDoc.line(starX, starY - 2, starX + 1, starY + 2);
        pdfDoc.line(starX + 1, starY + 2, starX - 2, starY - 0.5);
        pdfDoc.line(starX - 2, starY - 0.5, starX + 2, starY - 0.5);
        pdfDoc.line(starX + 2, starY - 0.5, starX - 1, starY + 2);
        pdfDoc.line(starX - 1, starY + 2, starX, starY - 2);

        pdfDoc.setTextColor(255, 255, 255);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(10);
        pdfDoc.text("VIP CLIENT", 36, 120.5, { align: 'center' });
        pdfDoc.setTextColor(0, 0, 0);
      }

      const payStatus = invoiceData?.paymentStatus ?? 'Due';

      // Centered Stamp/Mark for Paid or Due status
      if (payStatus === 'Paid') {
        pdfDoc.setDrawColor(34, 197, 94); // Green
        pdfDoc.setLineWidth(1.2);
        pdfDoc.roundedRect(87, 69, 36, 12, 1.5, 1.5, 'D');
        pdfDoc.setLineWidth(0.4);
        pdfDoc.roundedRect(88.5, 70.5, 33, 9, 1, 1, 'D');
        
        pdfDoc.setTextColor(34, 197, 94);
        pdfDoc.setFontSize(13);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("PAID", 105, 77.5, { align: 'center' });
        pdfDoc.setTextColor(0, 0, 0);
      } else {
        pdfDoc.setDrawColor(220, 38, 38); // Red
        pdfDoc.setLineWidth(1.2);
        pdfDoc.roundedRect(87, 69, 36, 12, 1.5, 1.5, 'D');
        pdfDoc.setLineWidth(0.4);
        pdfDoc.roundedRect(88.5, 70.5, 33, 9, 1, 1, 'D');
        
        pdfDoc.setTextColor(220, 38, 38);
        pdfDoc.setFontSize(13);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("DUE", 105, 77.5, { align: 'center' });
        pdfDoc.setTextColor(0, 0, 0);
      }

      // Customer Info Box - Modern Style
      pdfDoc.setFillColor(248, 250, 252);
      pdfDoc.rect(120, 80, 75, 50, 'F');
      pdfDoc.setDrawColor(226, 232, 240);
      pdfDoc.rect(120, 80, 75, 50);
      
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(100, 116, 139);
      pdfDoc.text("BILLING TO", 127, 90);
      
      pdfDoc.setFontSize(16);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text(currentCustomer?.name || "N/A", 127, 100);
      
      pdfDoc.setFontSize(10);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setTextColor(71, 85, 105);
      pdfDoc.text(`Client ID: ${currentCustomer?.customerId || "N/A"}`, 127, 108);
      pdfDoc.text(`Mobile: ${currentCustomer?.mobile || "N/A"}`, 127, 114);
      pdfDoc.text(currentCustomer?.address || "N/A", 127, 120, { maxWidth: 60 });

      // Table
      const tableData = currentItems.map(item => [
        item.product,
        item.category,
        item.quantity.toString(),
        item.costPerProduct.toLocaleString(),
        item.total.toLocaleString()
      ]);

      autoTable(pdfDoc, {
        startY: 140,
        head: [['DESCRIPTION', 'CATEGORY', 'QTY', 'PRICE (BDT)', 'TOTAL (BDT)']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: [197, 160, 40], // Rich Gold
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          minCellHeight: 12
        },
        bodyStyles: { 
          fontSize: 9,
          textColor: [30, 41, 59],
          minCellHeight: 10,
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 75, halign: 'left' },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 15, halign: 'center' },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 15, right: 15 },
        didDrawPage: (data) => {
          // Add custom footer on each page
          pdfDoc.setFontSize(8);
          pdfDoc.setTextColor(150, 150, 150);
          pdfDoc.text("Roana Gown & Glory - Professional Sales Memo", 105, 285, { align: 'center' });
        }
      });

      let finalY = (pdfDoc as any).lastAutoTable.finalY + 15;
      
      // Page break check for summary section
      if (finalY > 210) {
        pdfDoc.addPage();
        finalY = 30; // Reset to top of new page
      }

      // Summary Section
      const summaryX = 130;
      
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(100, 116, 139);
      pdfDoc.text("SUBTOTAL:", summaryX, finalY);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text(`${currentTotal.toLocaleString()} BDT`, 195, finalY, { align: 'right' });

      const advAmt = invoiceData?.advanceAmount !== undefined 
        ? invoiceData.advanceAmount 
        : (advanceMode === 'percent' 
            ? Math.round((currentTotal * advancePercentage) / 100) 
            : manualAdvanceAmount);

      const dueAmt = invoiceData?.dueAmount !== undefined 
        ? invoiceData.dueAmount 
        : Math.max(0, currentTotal - advAmt);

      const advPercentRepr = invoiceData?.advancePercentage !== undefined 
        ? invoiceData.advancePercentage 
        : (advanceMode === 'percent' 
            ? advancePercentage 
            : (currentTotal > 0 ? Math.round((manualAdvanceAmount / currentTotal) * 100) : 0));

      pdfDoc.setTextColor(100, 116, 139);
      pdfDoc.text(`ADVANCE (${advPercentRepr}%):`, summaryX, finalY + 8);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text(`${advAmt.toLocaleString()} BDT`, 195, finalY + 8, { align: 'right' });

      pdfDoc.setDrawColor(226, 232, 240);
      pdfDoc.setLineWidth(0.1);
      pdfDoc.line(summaryX, finalY + 12, 195, finalY + 12);

      pdfDoc.setFontSize(11);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text(payStatus === 'Paid' ? "TOTAL PAID:" : "DUE AMOUNT:", summaryX, finalY + 18);
      
      if (payStatus === 'Paid') {
        pdfDoc.setTextColor(34, 197, 94); // Green
      } else {
        pdfDoc.setTextColor(220, 38, 38); // Red
      }
      pdfDoc.text(`${(payStatus === 'Paid' ? currentTotal : dueAmt).toLocaleString()} BDT`, 195, finalY + 18, { align: 'right' });

      // bKash Branding Section
      const bkashY = finalY + 35;
      
      // Top Row: Text & Logo
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(18);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text("Make bKash Payment", 15, bkashY - 5);
      
      const logoRightX = 195;
      pdfDoc.setFillColor(226, 19, 110);
      pdfDoc.circle(logoRightX - 4, bkashY - 10, 4, 'F');
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.setFontSize(8);
      pdfDoc.text("b", logoRightX - 4, bkashY - 8.5, { align: 'center' });

      pdfDoc.setFillColor(226, 19, 110);
      pdfDoc.roundedRect(15, bkashY, 180, 40, 3, 3, 'F');
      
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.setFontSize(12);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text("bKash Merchant Number", 105, bkashY + 12, { align: 'center' });
      
      pdfDoc.setFontSize(32);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(bkashNumber, 105, bkashY + 30, { align: 'center' });

      // Footer divider - Sharp line
      pdfDoc.setDrawColor(230, 230, 230);
      pdfDoc.setLineWidth(0.4);
      pdfDoc.line(15, bkashY + 50, 195, bkashY + 50);
      
      // Footer text - Matched to Image
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.setFontSize(12);
      pdfDoc.setFont("times", "italic");
      pdfDoc.text(paymentNote || "Thank you!", 15, bkashY + 58);
      
      pdfDoc.setFontSize(9);
      pdfDoc.setFont("courier", "normal");
      pdfDoc.text("www.roanagownglory.com", 195, bkashY + 58, { align: 'right' });

      // Footer
      pdfDoc.setTextColor(150, 150, 150);
      pdfDoc.setFontSize(8);
      pdfDoc.text("Professionally generated by Roana Gown & Glory Management System", 105, 290, { align: 'center' });

      // Save PDF
      const fileName = `${currentInvoiceNo}_${currentCustomer?.name || 'Invoice'}.pdf`;
      
      // Use a robust download method for both standard and restricted environments (iframes)
      try {
        const blob = pdfDoc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Revoke the URL after a short delay to ensure the browser has started the download
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } catch (e) {
        console.warn("Download failed, trying fallback:", e);
        pdfDoc.save(fileName);
      }

      return true;
    } catch (error) {
      console.error("PDF Generation Error:", error);
      toast.error("Failed to generate PDF. Check console for details.");
      return false;
    }
  };

  const saveInvoice = async () => {
    // 1. Validation
    if (!selectedCustomer) {
      toast.error("Please select a customer before saving.");
      const searchInput = document.querySelector('input[placeholder="Type Name or ID..."]') as HTMLInputElement;
      if (searchInput) searchInput.focus();
      return;
    }

    if (items.length === 0 || items.every(i => !i.product)) {
      toast.error("Please add at least one product with a description.");
      return;
    }

    if (totalAmount <= 0) {
      toast.error("Invoice total must be greater than 0 BDT.");
      return;
    }

    setLoading(true);
    
    const advAmt = advanceMode === 'percent' 
      ? Math.round((totalAmount * advancePercentage) / 100) 
      : manualAdvanceAmount;
    const dueAmt = Math.max(0, totalAmount - advAmt);
    const finalPercentage = advanceMode === 'percent'
      ? advancePercentage
      : (totalAmount > 0 ? Math.round((manualAdvanceAmount / totalAmount) * 100) : 0);

    // Create a backup of the data in case Firestore fails
    const invoiceBackup = {
      customerId: selectedCustomer.customerId,
      customerName: selectedCustomer.name,
      items: items.map(({ id, ...rest }) => rest),
      totalAmount,
      advancePercentage: finalPercentage,
      advanceAmount: advAmt,
      dueAmount: dueAmt,
      date: new Date().toISOString(),
      status: 'pending_sync'
    };

    try {
      // 2. Fetch App Settings for Prefix
      let prefix = 'ROGG';
      let vipPrefix = '';
      try {
        const settingsRef = doc(db, 'settings', 'app');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const appSettings = settingsSnap.data();
          prefix = appSettings.invoicePrefix || 'ROGG';
          vipPrefix = appSettings.vipFolderPrefix || '';
        }
      } catch (settingsError) {
        console.warn("Could not fetch settings, using defaults.", settingsError);
      }

      let finalInvoiceNo = '';
      const isVIP = selectedCustomer.type === 'VIP';
      const folderName = isVIP 
        ? (selectedCustomer.group || selectedCustomer.name).toLowerCase().replace(/\s+/g, '-') 
        : '';
      
      const counterRef = isVIP 
        ? doc(db, 'vip_counters', folderName)
        : doc(db, 'counters', 'invoices');

      // 3. Database Transaction
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        let nextNo = 1;
        if (counterSnap.exists()) {
          nextNo = counterSnap.data().lastNo + 1;
        }
        
        finalInvoiceNo = isVIP 
          ? `${prefix}-VIP-${folderName}${vipPrefix ? '-' + vipPrefix : ''}-${nextNo.toString().padStart(4, '0')}`
          : `${prefix}-${nextNo.toString().padStart(4, '0')}`;
        
        const invoiceRef = doc(collection(db, 'invoices'));
        transaction.set(invoiceRef, {
          invoiceNo: finalInvoiceNo,
          customerId: selectedCustomer.customerId,
          customerName: selectedCustomer.name,
          customerType: selectedCustomer.type || 'Regular',
          date: Timestamp.now(),
          items: items.map(({ id, ...rest }) => rest),
          totalAmount,
          paymentMethod: 'Bkash Merchant',
          advancePercentage: finalPercentage,
          advanceAmount: advAmt,
          dueAmount: dueAmt,
          paymentStatus: 'Due',
          createdAt: Timestamp.now()
        });
        
        transaction.set(counterRef, { lastNo: nextNo });
      });
      
      console.log(`Invoice ${finalInvoiceNo} saved successfully to Firestore.`);
      
      // 4. PDF Generation
      const pdfSuccess = await generatePDF({
        id: 'temp',
        invoiceNo: finalInvoiceNo,
        customerId: selectedCustomer.customerId,
        customerName: selectedCustomer.name,
        customerType: selectedCustomer.type || 'Regular',
        date: Timestamp.now(),
        items: items.map(({ id, ...rest }) => rest),
        totalAmount,
        paymentMethod: 'Bkash Merchant',
        advancePercentage: finalPercentage,
        advanceAmount: advAmt,
        dueAmount: dueAmt,
        paymentStatus: 'Due'
      });

      if (pdfSuccess) {
        toast.success(`Invoice ${finalInvoiceNo} generated and saved!`);
        // Reset form
        setItems([{ id: Date.now().toString(), product: '', category: PRODUCT_CATEGORIES[0], quantity: 1, costPerProduct: 0, total: 0 }]);
        setSelectedCustomerId('');
        setCustomerSearch('');
        generateNextInvoiceNo();
        
        // Remove locally cached backup if exists
        localStorage.removeItem('last_invoice_draft');
      }
    } catch (error: any) {
      console.error("Critical error in saveInvoice:", error);
      
      // Local Fallback Storage
      try {
        localStorage.setItem('last_invoice_draft', JSON.stringify(invoiceBackup));
        toast.error("Database connection failed. Invoice saved locally in this browser.");
      } catch (e) {
        toast.error("Critical failure: Could not save to database or local storage.");
      }

      // More descriptive error messages based on Firebase error codes
      if (error.code === 'permission-denied') {
        toast.error("Security access denied. Please contact the administrator.");
      } else if (error.code === 'unavailable') {
        toast.error("Network offline or Firebase service unavailable.");
      } else {
        toast.error(`Save failed: ${error.message || 'Unknown error occurred'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         inv.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || 
                           inv.items.some(item => item.category === categoryFilter);
    const matchesType = typeFilter === 'all' || inv.customerType === typeFilter;
    const matchesStatus = paymentStatusFilter === 'all' || inv.paymentStatus === paymentStatusFilter;
    return matchesSearch && matchesCategory && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2">
            <ShoppingBag className="h-5 w-5" />
            <span className="text-sm font-bold uppercase tracking-widest">Shop Mode</span>
          </div>
          <h2 className="text-4xl font-serif font-bold text-primary">
            {view === 'create' ? 'Invoice & Memo' : 'Invoice History'}
          </h2>
          <p className="text-muted-foreground mt-1">
            {view === 'create' 
              ? 'Create professional quotations and sales memos for your clients.' 
              : 'View and manage your past business transactions.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view === 'create' && (
            <div className="bg-primary text-primary-foreground px-6 py-3 rounded-xl border border-border shadow-lg">
              <p className="text-[10px] uppercase tracking-tighter opacity-70">Current Serial</p>
              <p className="text-2xl font-sans font-bold">{isGeneratingNo ? '...' : invoiceNo}</p>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'create' ? (
          <motion.div 
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-12 gap-8"
          >
            {/* bKash Payment Banner - Identical to Uploaded Design */}
            <div className="col-span-12">
              <div className="bg-white rounded-3xl p-8 md:p-10 shadow-xl border border-border space-y-6 relative overflow-hidden group">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <h3 className="text-2xl md:text-3xl font-sans font-bold text-[#1a1a1a] tracking-tight">Make bKash Payment</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#E2136E] rounded-full flex items-center justify-center shadow-lg shadow-[#E2136E]/30 group-hover:scale-110 transition-transform duration-500">
                      <span className="text-white text-xl font-black italic">b</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#E2136E] rounded-2xl p-6 md:p-8 text-center shadow-2xl shadow-[#E2136E]/40 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
                  <div className="relative z-10">
                    <p className="text-white/80 text-sm font-medium mb-1 tracking-widest uppercase">bKash Merchant Number</p>
                    <p className="text-4xl md:text-6xl font-sans font-black text-white tracking-tighter tabular-nums">{bkashNumber}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex flex-col md:flex-row items-center justify-between gap-2">
                  <p className="text-lg md:text-xl font-serif italic text-[#1a1a1a]">{paymentNote || "Thank you!"}</p>
                  <p className="text-[10px] md:text-xs font-mono text-muted-foreground tracking-widest uppercase">www.roanagownglory.com</p>
                </div>
              </div>
            </div>

            {/* Left Side: Items Selection */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              <Card className="border border-border shadow-xl bg-card overflow-hidden h-full flex flex-col rounded-3xl">
                <CardHeader className="bg-primary text-primary-foreground p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
                        <Receipt className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-bold">Product Order</CardTitle>
                        <CardDescription className="text-white/60 text-sm">Detailed itemization for the client memo.</CardDescription>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={addItem} 
                      className="h-12 bg-white/10 border-white/20 text-white hover:bg-white hover:text-primary transition-all font-bold px-6 rounded-xl"
                    >
                      <Plus className="mr-2 h-5 w-5" />
                      Add Item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted border-b border-border">
                          <TableHead className="py-4 px-4 text-primary font-bold uppercase tracking-widest text-[9px]">Description</TableHead>
                          <TableHead className="w-[160px] text-primary font-bold uppercase tracking-widest text-[9px]">Category</TableHead>
                          <TableHead className="w-[80px] text-primary font-bold uppercase tracking-widest text-[9px] text-center">Qty</TableHead>
                          <TableHead className="w-[130px] text-primary font-bold uppercase tracking-widest text-[9px]">Price (BDT)</TableHead>
                          <TableHead className="w-[130px] text-right text-primary font-bold uppercase tracking-widest text-[9px]">Total</TableHead>
                          <TableHead className="w-[50px] px-4"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id} className="group hover:bg-muted/30 transition-colors border-b border-border last:border-0">
                            <TableCell className="px-4 py-3">
                              <Input 
                                placeholder="Product name..." 
                                value={item.product}
                                onChange={e => updateItem(item.id, 'product', e.target.value)}
                                className="h-9 text-xs border-border focus:border-primary focus:ring-primary/20 transition-all font-medium rounded-md"
                              />
                            </TableCell>
                            <TableCell className="py-3">
                              <Select 
                                value={item.category} 
                                onValueChange={val => updateItem(item.id, 'category', val)}
                              >
                                <SelectTrigger className="h-9 border-border text-xs rounded-md">
                                  <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRODUCT_CATEGORIES.map(cat => (
                                    <SelectItem key={cat} value={cat} className="py-1.5 text-xs">{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-3">
                              <Input 
                                type="number" 
                                min="1"
                                value={item.quantity}
                                onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                className="h-9 border-border text-center font-bold text-xs rounded-md"
                              />
                            </TableCell>
                            <TableCell className="py-3">
                              <Input 
                                type="number" 
                                value={item.costPerProduct}
                                onChange={e => updateItem(item.id, 'costPerProduct', parseFloat(e.target.value) || 0)}
                                className="h-9 border-border font-bold text-xs rounded-md"
                              />
                            </TableCell>
                            <TableCell className="text-right font-bold text-base text-primary font-sans">
                              {item.total.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                               <Button 
                                size="icon" 
                                variant="ghost" 
                                onClick={() => removeItem(item.id)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all rounded-full"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Side: Customer & Summary */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
              <Card className="border border-border shadow-2xl bg-card overflow-hidden flex flex-col h-full">
                <CardHeader className="border-b border-border p-8">
                  <div className="flex items-center gap-3 text-primary">
                    <User className="h-6 w-6" />
                    <CardTitle className="text-2xl font-sans font-bold">Customer & Summary</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8 flex-1">
                  <div className="space-y-4 relative customer-search-container">
                    <Label className="text-muted-foreground uppercase text-[10px] font-bold tracking-[0.2em]">Search Client (Name or ID)</Label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input 
                        placeholder="Type Name or ID..." 
                        value={customerSearch}
                        onChange={e => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerResults(true);
                        }}
                        onFocus={() => setShowCustomerResults(true)}
                        className="pl-12 h-16 border-border text-lg font-medium rounded-2xl shadow-sm focus:ring-primary/10"
                      />
                    </div>

                    <AnimatePresence>
                      {showCustomerResults && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-50 left-0 right-0 mt-2 bg-card rounded-2xl shadow-2xl border border-border max-h-80 overflow-y-auto"
                        >
                          {customers
                            .filter(c => {
                              if (!customerSearch) return true;
                              const search = customerSearch.toLowerCase();
                              return (
                                (c.name?.toLowerCase() || '').includes(search) || 
                                (c.customerId?.toLowerCase() || '').includes(search) ||
                                (c.mobile?.toLowerCase() || '').includes(search)
                              );
                            })
                            .map(c => (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setSelectedCustomerId(c.customerId);
                                  setCustomerSearch(c.name);
                                  setShowCustomerResults(false);
                                }}
                                className="w-full text-left px-6 py-4 hover:bg-muted transition-colors border-b border-muted last:border-0 flex items-center justify-between group"
                              >
                                <div>
                                  <p className="font-bold text-primary group-hover:text-primary transition-colors text-lg">{c.name}</p>
                                  <p className="text-sm text-muted-foreground">{c.customerId} • {c.mobile}</p>
                                </div>
                                {c.type === 'VIP' && (
                                  <Badge className="bg-primary text-primary-foreground border-primary font-bold">VIP</Badge>
                                )}
                              </button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {selectedCustomer && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-6 rounded-2xl bg-muted border border-border space-y-4 shadow-inner"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest">Client Details</p>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tighter bg-card">Verified Account</Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1">Full Name</p>
                          <p className="text-lg font-sans font-bold text-primary">{selectedCustomer.name}</p>
                        </div>
                        
                        <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1">Mobile Number</p>
                          <p className="text-lg font-sans font-bold text-primary">{selectedCustomer.mobile || 'N/A'}</p>
                        </div>
 
                        <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mb-1">Billing Address</p>
                          <p className="text-sm text-primary leading-relaxed">{selectedCustomer.address || 'No address provided'}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                    <div className="pt-8 border-t border-border space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="flex items-center justify-between bg-muted p-5 rounded-2xl border border-border shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center">
                              <Calculator className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Subtotal</p>
                              <p className="text-lg font-sans font-bold text-primary">{totalAmount.toLocaleString()} BDT</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-muted p-5 rounded-2xl border border-border shadow-sm space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                                <CreditCard className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  Advance ({calculatedAdvancePercentage}%)
                                </p>
                                <p className="text-lg font-sans font-bold text-primary">
                                  {calculatedAdvanceAmount.toLocaleString()} BDT
                                </p>
                              </div>
                            </div>

                            {/* Manual Advance Toggle Control */}
                            <div className="flex bg-stone-200/80 p-0.5 rounded-lg border border-stone-300 shadow-sm shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAdvanceModeChange('percent')}
                                className={cn(
                                  "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all duration-200",
                                  advanceMode === 'percent' ? "bg-primary text-primary-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-primary"
                                )}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdvanceModeChange('manual')}
                                className={cn(
                                  "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-all duration-200",
                                  advanceMode === 'manual' ? "bg-primary text-primary-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-primary"
                                )}
                              >
                                BDT
                              </button>
                            </div>
                          </div>

                          {advanceMode === 'percent' ? (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase px-0.5">
                                <span>Adjust percentage</span>
                                <span className="text-primary font-sans">{advancePercentage}%</span>
                              </div>
                              <div className="px-2 pb-1">
                                <Input 
                                  type="range" 
                                  min="0" 
                                  max="100" 
                                  step="5"
                                  value={advancePercentage}
                                  onChange={e => setAdvancePercentage(parseInt(e.target.value))}
                                  className="h-2 bg-stone-200 accent-primary cursor-pointer w-full"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase px-0.5">
                                <span>Enter Manual Amount</span>
                                <span className="text-primary font-sans text-[10px]">{calculatedAdvancePercentage}% equivalent</span>
                              </div>
                              <div className="relative">
                                <Input 
                                  type="number"
                                  min="0"
                                  max={totalAmount}
                                  placeholder="0"
                                  value={manualAdvanceAmount || ''}
                                  onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    setManualAdvanceAmount(Math.min(totalAmount, val));
                                  }}
                                  className="h-9 border-border bg-card pr-12 text-xs font-bold text-primary focus:border-primary focus:ring-primary/20 transition-all rounded-md font-sans"
                                />
                                <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-black text-muted-foreground tracking-widest uppercase pointer-events-none">BDT</span>
                              </div>
                            </div>
                          )}
                        </div>
                      {/* Enhanced Financial Status Visibility */}
                      <div className="p-6 rounded-3xl bg-card text-card-foreground shadow-xl relative overflow-hidden border border-border group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                          <Crown className="h-24 w-24" />
                        </div>
                        
                        <div className="relative z-10 space-y-6">
                          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary border-b border-primary/10 pb-2 inline-block">Order Valuation</p>
                          
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-success/5 border border-success/10">
                              <div className="flex items-center gap-3">
                                <CreditCard className="h-5 w-5 text-success" />
                                <span className="text-xs font-bold text-success uppercase tracking-widest">Paid Total</span>
                              </div>
                              <span className="text-xl font-sans font-black text-success tabular-nums">
                                {calculatedAdvanceAmount.toLocaleString()} <span className="text-[10px] font-normal opacity-60">BDT</span>
                              </span>
                            </div>

                            <div className="flex flex-col gap-2 p-5 rounded-2xl bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 relative overflow-hidden">
                              <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                  <AlertCircle className="h-6 w-6 text-white" />
                                  <span className="text-sm font-black uppercase tracking-[0.1em]">Due Balance</span>
                                </div>
                                <span className="text-3xl font-sans font-black tracking-tighter tabular-nums text-white">
                                  {calculatedDueAmount.toLocaleString()} <span className="text-xs font-normal opacity-70">BDT</span>
                                </span>
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 relative z-10 text-right">Pending at delivery</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                      <Button 
                        onClick={saveInvoice}
                        disabled={loading || !selectedCustomerId}
                        className={cn(
                          "w-full h-24 rounded-[2rem] text-lg font-serif font-bold shadow-2xl transition-all active:scale-[0.98] disabled:opacity-50 group relative overflow-hidden",
                          loading ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        <div className="relative z-10 flex items-center justify-center gap-4">
                          {loading ? (
                            <Loader2 className="h-8 w-8 animate-spin" />
                          ) : (
                            <>
                              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileText className="h-7 w-7" />
                              </div>
                              <div className="flex flex-col items-start">
                                <span className="leading-none">Generate Memo</span>
                                <span className="text-[10px] font-sans uppercase tracking-[0.2em] opacity-60 mt-1">Save & Download PDF</span>
                              </div>
                            </>
                          )}
                        </div>
                        {!loading && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        )}
                      </Button>
                    </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <Card className="border border-border shadow-xl bg-card overflow-hidden">
              <CardHeader className="bg-primary text-primary-foreground p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <History className="h-6 w-6" />
                    <CardTitle className="text-2xl font-sans font-bold">Past Invoices</CardTitle>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground/60" />
                      <Input 
                        placeholder="Search Invoice or Customer..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10 h-12 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/40 focus:bg-primary-foreground/20"
                      />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-12 w-full md:w-48 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground focus:bg-primary-foreground/20">
                        <SelectValue placeholder="Filter Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {PRODUCT_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={(val: any) => setTypeFilter(val)}>
                      <SelectTrigger className="h-12 w-full md:w-40 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground focus:bg-primary-foreground/20">
                        <SelectValue placeholder="Client Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Clients</SelectItem>
                        <SelectItem value="Regular">Regular Only</SelectItem>
                        <SelectItem value="VIP">VIP (Folder A)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={paymentStatusFilter} onValueChange={(val: any) => setPaymentStatusFilter(val)}>
                      <SelectTrigger className="h-12 w-full md:w-40 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground focus:bg-primary-foreground/20">
                        <SelectValue placeholder="Payment Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Due">Due</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="py-6 px-6 font-bold text-primary">Invoice No</TableHead>
                      <TableHead className="font-bold text-primary">Customer</TableHead>
                      <TableHead className="font-bold text-primary">Date</TableHead>
                      <TableHead className="font-bold text-primary">Amount</TableHead>
                      <TableHead className="font-bold text-primary">Items</TableHead>
                      <TableHead className="text-right px-6 font-bold text-primary">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length > 0 ? (
                      filteredInvoices.map((inv) => (
                        <TableRow key={inv.id} className="hover:bg-muted transition-colors">
                          <TableCell className="px-6 py-4 font-sans font-bold text-primary">
                            <div className="flex flex-col">
                              <span>{inv.invoiceNo}</span>
                              {inv.customerType === 'VIP' && (
                                <span className="text-[8px] text-primary font-bold uppercase tracking-tighter">VIP Folder A</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-primary">{inv.customerName}</TableCell>
                          <TableCell className="text-primary">{format(inv.date.toDate(), 'PPP')}</TableCell>
                          <TableCell className="font-bold text-primary">{inv.totalAmount.toLocaleString()} BDT</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-1 rounded-full bg-muted text-[10px] font-bold text-primary uppercase w-fit">
                                {inv.items.length} {inv.items.length === 1 ? 'Item' : 'Items'}
                              </span>
                              <span className={cn(
                                "px-2 py-1 rounded-full text-[10px] font-bold uppercase w-fit",
                                inv.paymentStatus === 'Paid' 
                                  ? "bg-green-100 text-green-700 border border-green-200" 
                                  : "bg-red-100 text-red-700 border border-red-200"
                              )}>
                                {inv.paymentStatus === 'Paid' ? 'Paid' : `Due: ${inv.dueAmount?.toLocaleString()} BDT`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <div className="flex justify-end gap-2">
                              {inv.paymentStatus !== 'Paid' && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => markAsPaid(inv.id)}
                                  className="border-primary text-primary hover:bg-muted font-bold"
                                >
                                  Mark Paid
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={async () => await generatePDF(inv)}
                                className="text-primary hover:text-primary hover:bg-primary/10 font-bold"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download PDF
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => {
                                  setInvoiceToDelete(inv.id);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          No invoices found matching your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px] border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-destructive p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-serif">Confirm Deletion</DialogTitle>
              <CardDescription className="text-white/70">
                This action is permanent and will remove the invoice record from your history forever.
              </CardDescription>
            </DialogHeader>
          </div>
          <div className="p-8 flex flex-col gap-4 bg-white">
            <p className="text-muted-foreground text-sm">Are you absolutely sure you want to delete this invoice record?</p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 h-12 rounded-xl border-border"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteInvoice}
                disabled={loading}
                className="flex-1 h-12 rounded-xl bg-destructive font-bold"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
