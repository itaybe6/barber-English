import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useBusinessColors } from '@/lib/hooks/useBusinessColors';
import { useTranslation } from 'react-i18next';
import { businessProfileApi } from '@/lib/api/businessProfile';
import { expensesApi } from '@/lib/api/expenses';
import { financeApi } from '@/lib/api/finance';
import type { ServiceIncomeBreakdown } from '@/lib/api/finance';
import type { BusinessExpense, BusinessProfile, ExpenseCategory } from '@/lib/supabase';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  Mail,
  X,
} from 'lucide-react-native';

const CATEGORIES: ExpenseCategory[] = ['rent', 'supplies', 'equipment', 'marketing', 'other'];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  rent: '#6366F1',
  supplies: '#F59E0B',
  equipment: '#10B981',
  marketing: '#EC4899',
  other: '#6B7280',
};

const shadowStyle = Platform.select({
  ios: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  android: {
    elevation: 3,
  },
});

export default function FinanceScreen() {
  const router = useRouter();
  const { colors: businessColors } = useBusinessColors();
  const { t } = useTranslation();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [loading, setLoading] = useState(true);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomeBreakdown, setIncomeBreakdown] = useState<ServiceIncomeBreakdown[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [businessNumber, setBusinessNumber] = useState('');
  const [accountantEmail, setAccountantEmail] = useState('');

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState<ExpenseCategory>('other');
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [report, prof] = await Promise.all([
        financeApi.getMonthlyReport(year, month),
        businessProfileApi.getProfile(),
      ]);

      setTotalIncome(report.totalIncome);
      setTotalExpenses(report.totalExpenses);
      setIncomeBreakdown(report.incomeBreakdown);
      setExpenses(report.expenses);

      if (prof) {
        setProfile(prof);
        setBusinessNumber(prof.business_number || '');
        setAccountantEmail(prof.accountant_email || '');
      }
    } catch (err) {
      console.error('Error loading finance data:', err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const goToPreviousMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const netProfit = totalIncome - totalExpenses;

  const handleAddExpense = async () => {
    const amount = parseFloat(newExpenseAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('error.generic'), t('finance.amountPlaceholder'));
      return;
    }

    setSavingExpense(true);
    try {
      const today = new Date();
      const expenseDate = `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const result = await expensesApi.createExpense({
        amount,
        description: newExpenseDescription.trim() || undefined,
        category: newExpenseCategory,
        expense_date: expenseDate,
      });

      if (result) {
        Alert.alert(t('success.generic'), t('finance.expenseAdded'));
        setNewExpenseAmount('');
        setNewExpenseDescription('');
        setNewExpenseCategory('other');
        setShowAddExpense(false);
        loadData();
      } else {
        Alert.alert(t('error.generic'), t('finance.expenseAddFailed'));
      }
    } catch (err) {
      Alert.alert(t('error.generic'), t('finance.expenseAddFailed'));
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (expense: BusinessExpense) => {
    Alert.alert(
      t('finance.deleteExpense'),
      t('finance.deleteExpenseConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            const ok = await expensesApi.deleteExpense(expense.id);
            if (ok) {
              loadData();
            } else {
              Alert.alert(t('error.generic'), t('finance.expenseDeleteFailed'));
            }
          },
        },
      ],
    );
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const result = await businessProfileApi.upsertProfile({
        ...profile,
        business_number: businessNumber.trim() || undefined,
        accountant_email: accountantEmail.trim() || undefined,
      } as any);

      if (result) {
        setProfile(result);
        Alert.alert(t('success.generic'), t('finance.settingsSaved'));
      } else {
        Alert.alert(t('error.generic'), t('finance.settingsSaveFailed'));
      }
    } catch (err) {
      Alert.alert(t('error.generic'), t('finance.settingsSaveFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={businessColors.primary} />
          <Text style={styles.loadingText}>{t('finance.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F7F8FA' }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('finance.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Month Picker */}
        <View style={styles.monthPicker}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthArrow}>
            <ChevronLeft size={22} color={businessColors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {monthNames[month - 1]} {year}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrow}>
            <ChevronRight size={22} color={businessColors.primary} />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#ECFDF5' }, shadowStyle]}>
            <TrendingUp size={20} color="#16A34A" />
            <Text style={styles.summaryLabel}>{t('finance.totalIncome')}</Text>
            <Text style={[styles.summaryAmount, { color: '#16A34A' }]}>
              {formatCurrency(totalIncome)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#FEF2F2' }, shadowStyle]}>
            <TrendingDown size={20} color="#DC2626" />
            <Text style={styles.summaryLabel}>{t('finance.totalExpenses')}</Text>
            <Text style={[styles.summaryAmount, { color: '#DC2626' }]}>
              {formatCurrency(totalExpenses)}
            </Text>
          </View>
        </View>

        <View style={[styles.netProfitCard, shadowStyle]}>
          <DollarSign size={22} color={netProfit >= 0 ? '#16A34A' : '#DC2626'} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.netProfitLabel}>{t('finance.netProfit')}</Text>
            <Text
              style={[
                styles.netProfitAmount,
                { color: netProfit >= 0 ? '#16A34A' : '#DC2626' },
              ]}
            >
              {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
            </Text>
          </View>
        </View>

        {/* Income Breakdown */}
        <Text style={styles.sectionTitle}>{t('finance.incomeBreakdown')}</Text>
        <View style={[styles.card, shadowStyle]}>
          {incomeBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>{t('finance.noIncome')}</Text>
          ) : (
            incomeBreakdown.map((item, index) => (
              <View
                key={item.service_id || item.service_name}
                style={[
                  styles.incomeRow,
                  index < incomeBreakdown.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.incomeServiceName}>{item.service_name}</Text>
                  <Text style={styles.incomeServiceDetail}>
                    {item.count} {t('finance.appointments')} x {formatCurrency(item.price)}
                  </Text>
                </View>
                <Text style={[styles.incomeServiceTotal, { color: '#16A34A' }]}>
                  {formatCurrency(item.total)}
                </Text>
              </View>
            ))
          )}
          {incomeBreakdown.length > 0 && (
            <Text style={styles.priceNote}>{t('finance.priceNote')}</Text>
          )}
        </View>

        {/* Expenses */}
        <View style={styles.expensesHeader}>
          <Text style={styles.sectionTitle}>{t('finance.expensesList')}</Text>
          <TouchableOpacity
            style={[styles.addExpenseButton, { backgroundColor: businessColors.primary }]}
            onPress={() => setShowAddExpense(true)}
          >
            <Plus size={18} color={Colors.white} />
            <Text style={styles.addExpenseText}>{t('finance.addExpense')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, shadowStyle]}>
          {expenses.length === 0 ? (
            <Text style={styles.emptyText}>{t('finance.noExpenses')}</Text>
          ) : (
            expenses.map((expense, index) => (
              <View
                key={expense.id}
                style={[
                  styles.expenseRow,
                  index < expenses.length - 1 && styles.rowBorder,
                ]}
              >
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: CATEGORY_COLORS[expense.category as ExpenseCategory] || CATEGORY_COLORS.other },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseDescription}>
                    {expense.description || t(`finance.categories.${expense.category}`)}
                  </Text>
                  <Text style={styles.expenseCategory}>
                    {t(`finance.categories.${expense.category}`)} &middot; {expense.expense_date}
                  </Text>
                </View>
                <Text style={[styles.expenseAmount, { color: '#DC2626' }]}>
                  -{formatCurrency(Number(expense.amount))}
                </Text>
                <TouchableOpacity
                  onPress={() => handleDeleteExpense(expense)}
                  style={styles.deleteButton}
                >
                  <Trash2 size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Accountant Settings */}
        <Text style={styles.sectionTitle}>{t('finance.accountantSettings')}</Text>
        <View style={[styles.card, shadowStyle]}>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Briefcase size={18} color={businessColors.primary} />
              <Text style={styles.inputLabelText}>{t('finance.businessNumber')}</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={businessNumber}
              onChangeText={setBusinessNumber}
              placeholder={t('finance.businessNumberPlaceholder')}
              placeholderTextColor="#999"
              keyboardType="default"
            />
          </View>

          <View style={[styles.inputGroup, { marginTop: 16 }]}>
            <View style={styles.inputLabel}>
              <Mail size={18} color={businessColors.primary} />
              <Text style={styles.inputLabelText}>{t('finance.accountantEmail')}</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={accountantEmail}
              onChangeText={setAccountantEmail}
              placeholder={t('finance.accountantEmailPlaceholder')}
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: businessColors.primary }]}
            onPress={handleSaveSettings}
            disabled={savingSettings}
          >
            {savingSettings ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>{t('save')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={showAddExpense} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('finance.addExpense')}</Text>
              <TouchableOpacity onPress={() => setShowAddExpense(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>{t('finance.amount')}</Text>
              <TextInput
                style={styles.textInput}
                value={newExpenseAmount}
                onChangeText={setNewExpenseAmount}
                placeholder={t('finance.amountPlaceholder')}
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <View style={[styles.inputGroup, { marginTop: 16 }]}>
              <Text style={styles.modalLabel}>{t('finance.description')}</Text>
              <TextInput
                style={styles.textInput}
                value={newExpenseDescription}
                onChangeText={setNewExpenseDescription}
                placeholder={t('finance.descriptionPlaceholder')}
                placeholderTextColor="#999"
              />
            </View>

            <View style={[styles.inputGroup, { marginTop: 16 }]}>
              <Text style={styles.modalLabel}>{t('finance.category')}</Text>
              <View style={styles.categoryPicker}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      newExpenseCategory === cat && {
                        backgroundColor: CATEGORY_COLORS[cat],
                        borderColor: CATEGORY_COLORS[cat],
                      },
                    ]}
                    onPress={() => setNewExpenseCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        newExpenseCategory === cat && { color: '#FFFFFF' },
                      ]}
                    >
                      {t(`finance.categories.${cat}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.modalSaveButton, { backgroundColor: businessColors.primary }]}
              onPress={handleAddExpense}
              disabled={savingExpense}
            >
              {savingExpense ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveButtonText}>{t('finance.addExpense')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.subtext,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    paddingTop: 8,
  },
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  monthArrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: Colors.white,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginHorizontal: 20,
    minWidth: 160,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
    gap: 6,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subtext,
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '800',
  },
  netProfitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
  },
  netProfitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtext,
  },
  netProfitAmount: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginLeft: 24,
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 18,
    padding: 18,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.subtext,
    textAlign: 'center',
    paddingVertical: 12,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  incomeServiceName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  incomeServiceDetail: {
    fontSize: 13,
    color: Colors.subtext,
    marginTop: 2,
  },
  incomeServiceTotal: {
    fontSize: 16,
    fontWeight: '700',
  },
  priceNote: {
    fontSize: 12,
    color: Colors.subtext,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  expensesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 20,
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addExpenseText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  expenseCategory: {
    fontSize: 13,
    color: Colors.subtext,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  deleteButton: {
    padding: 8,
  },
  inputGroup: {
    marginBottom: 0,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  inputLabelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: '#F9F9F9',
  },
  saveButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  modalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: Colors.white,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtext,
  },
  modalSaveButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
