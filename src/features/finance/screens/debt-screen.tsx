import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useFinance } from '../provider';
import { debtProgress } from '../debts';
import { calculateAccountSummary } from '../calculations';
import { formatMoney, parseMoney } from '../money';
import { philippineDateTime, formatTransactionDateTime, readableTransactionDate, isValidDate, isValidTime } from '../dates';
import { ActionButton, BackButton, FinanceScreen, IconButton } from '../components/ui';
import { useConfirmation } from '../components/confirmation';
import { MoneyField } from '../components/money-field';
import { TransactionDateTime } from '../components/transaction-date-time';
import { SelectionSheet } from '../components/selection-sheet';
import { AccountIcon } from '../components/account-icon';
import { FieldError } from '../components/field-error';
import type { Debt, DebtPayment } from '../types';

export default function DebtScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const { formatAmount } = useAmountVisibility();
  const confirmation = useConfirmation();
  const debt = finance.debts.find(row => row.id === id);
  const payments = finance.debtPayments.filter(row => row.debtId === id);
  const progress = debt ? debtProgress(debt,payments) : undefined;
  const [entryOpen,setEntryOpen] = useState(false);
  const [existing,setExisting] = useState(false);
  const [kind,setKind] = useState<Debt['kind']>('owe');
  const [name,setName] = useState('');
  const [amount,setAmount] = useState('');
  const [accountId,setAccountId] = useState('');
  const [dateTime,setDateTime] = useState(philippineDateTime);
  const [notes,setNotes] = useState('');
  const [picker,setPicker] = useState(false);
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [working,setWorking] = useState(false);
  const pending = useRef(false);
  const submission = useRef<string | undefined>(undefined);
  const locked = finance.busy || working;
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => pending.current || locked);
    return () => listener.remove();
  }, [locked]);
  const selectedAccount = finance.accounts.find(row => row.id === accountId);
  const input = { padding: 12, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border, color: theme.text };
  function leave() { if (router.canGoBack()) router.back(); else router.replace('/'); }
  function clearErrors() { setErrors({}); }
  let after: number | undefined;
  try {
    if(selectedAccount && (debt || !existing)) {
      const direction = debt ? debt.kind === 'owed' : kind === 'owe';
      const value = BigInt(calculateAccountSummary(selectedAccount,finance.transactions,'1900-01').balance) + BigInt(parseMoney(amount.replace(/,/g,''))) * (direction ? 1n : -1n);
      if(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) after = Number(value);
    }
  } catch { /* Incomplete fields are checked on Save. */ }
  async function save() {
    if(pending.current || locked || (id && !debt)) return;
    const next: Record<string,string> = {};
    if(!debt && !name.trim()) next.name = "Enter the person's name.";
    if((debt || !existing) && (!selectedAccount || selectedAccount.archived)) next.account = 'Choose an active account.';
    let cents = 0;
    try { cents = parseMoney(amount.replace(/,/g,'')); } catch { next.amount = 'Enter an amount greater than zero, with up to two decimal places.'; }
    if(!isValidDate(dateTime.transactionDate)) next.date = 'Choose a valid date.';
    if(!isValidTime(dateTime.transactionTime)) next.time = 'Choose a valid time.';
    if(debt && dateTime.transactionDate + dateTime.transactionTime < debt.transactionDate + debt.transactionTime) next.date = 'Repayment cannot be before the loan.';
    if(debt && cents > progress!.remaining) next.amount = 'Repayment cannot exceed the remaining debt.';
    if(Object.keys(next).length) { setErrors(next); return; }
    pending.current = true; setWorking(true);
    try {
      const recordId = submission.current ??= await finance.newSubmissionId();
      const now = new Date().toISOString();
      if(debt) {
        const payment: DebtPayment = { id: recordId,debtId: debt.id,accountId,amount:cents,...dateTime,notes:notes.trim() || undefined,createdAt:now };
        await finance.payDebt(payment);
        submission.current = undefined; setAmount(''); setNotes(''); clearErrors();
      } else {
        const record: Debt = { id:recordId,name:name.trim(),kind,existing:existing || undefined,accountId:existing ? undefined : accountId,amount:cents,...dateTime,notes:notes.trim() || undefined,createdAt:now,updatedAt:now };
        await finance.addDebt(record); leave();
      }
    } catch(cause) { finance.showNotice(cause instanceof Error ? cause.message : 'Could not save the debt record.',true); }
    finally { pending.current = false; setWorking(false); }
  }
  function remove(payment?: DebtPayment) {
    if(!debt || pending.current || locked) return;
    pending.current = true; let confirmed = false;
    confirmation.alert(payment ? 'Delete repayment?' : 'Delete debt?',payment ? 'Removes this repayment and reverses its account balance movement.' : debt.existing ? 'Removes this debt and its repayment history. Only recorded repayment movements are reversed; no initial balance change was recorded.' : 'Removes this debt and all repayments, reversing their account balance movements.',[
      { text:'Cancel',style:'cancel',onPress:()=>{pending.current=false;} },
      { text:'Delete',style:'destructive',onPress:()=>{
        if(confirmed)return;confirmed=true;setWorking(true);
        void finance.removeDebt(payment?.id ?? debt.id,Boolean(payment)).then(()=>{if(!payment)leave();}).catch(cause=>finance.showNotice(cause instanceof Error ? cause.message : 'Could not delete.',true)).finally(()=>{pending.current=false;setWorking(false);});
      } },
    ],{icon:'trash-outline',rows:[{label:'Person',value:debt.name},{label:payment ? 'Repayment' : 'Original debt',value:formatMoney(payment?.amount ?? debt.amount)}]});
  }
  return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title={id ? 'Debt details' : 'Add debt'} tabScreen={false} headerLeading={<BackButton disabled={locked} onPress={()=>{if(!pending.current)leave();}} />}>
      {id && !debt ? <ThemedText>This debt is no longer available.</ThemedText> : <>
        {debt ? <View style={{padding:14,borderRadius:16,backgroundColor:theme.backgroundElement,gap:8}}>
          <ThemedText type="smallBold">{debt.name} | {debt.kind === 'owe' ? 'I owe' : 'Owed to me'}</ThemedText>
          <ThemedText type="subtitle">{formatAmount(progress!.remaining)} remaining</ThemedText>
          <ThemedText type="small">Recorded amount: {formatAmount(debt.amount)} | Repaid: {formatAmount(progress!.paid)}</ThemedText>
          <ThemedText type="small">{progress!.settled ? 'Settled' : 'Outstanding'}{debt.dueDate ? ' | Due '+readableTransactionDate(debt.dueDate) : ''}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(debt.transactionDate,debt.transactionTime)} | {debt.existing ? 'Already happened' : finance.accounts.find(row=>row.id===debt.accountId)?.name}</ThemedText>
          {debt.notes ? <ThemedText type="small">{debt.notes}</ThemedText> : null}
        </View> : null}
        {!progress?.settled ? <View style={{padding:14,borderRadius:16,backgroundColor:theme.backgroundElement,gap:10}}>
          {!debt ? <>
            <View style={{flexDirection:'row',gap:8}}><ActionButton compact selected={kind==='owe'} label="I owe" disabled={locked} onPress={()=>setKind('owe')} /><ActionButton compact selected={kind==='owed'} label="Owed to me" disabled={locked} onPress={()=>setKind('owed')} /></View>
            <TextInput accessibilityLabel="Person name" value={name} onChangeText={value=>{setName(value);clearErrors();}} editable={!locked} placeholder="Person's name" placeholderTextColor={theme.textSecondary} selectionColor={theme.accent} cursorColor={theme.accent} underlineColorAndroid="transparent" style={[input,{borderColor:errors.name ? theme.error : theme.border}]} />
            <FieldError message={errors.name} />
            <ThemedText type="small">When did this happen?</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="When did this happen?" disabled={locked} onPress={()=>setEntryOpen(true)} style={[input,{flexDirection:'row',alignItems:'center',gap:8}]}>
              <ThemedText type="small" style={{flex:1}}>{existing ? 'Already happened' : 'Just now'}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>
            <ThemedText type="small">{existing ? 'Track the debt without changing my balance.' : 'Update my account balance.'}</ThemedText>

          </> : <ThemedText type="smallBold">{debt.kind==='owe' ? 'Record money repaid' : 'Record money received back'}</ThemedText>}
          <ThemedText type="small">{!debt && existing ? "Amount still owed (PHP)" : "Amount (PHP)"}</ThemedText>
          <MoneyField accessibilityLabel={debt ? 'Repayment amount' : 'Debt amount'} value={amount} editable={!locked} onValueChange={value=>{setAmount(value);clearErrors();}} onRejected={()=>setErrors({amount:'Use digits and up to two decimal places.'})} style={[input,{borderColor:errors.amount ? theme.error : theme.border}]} />
          <FieldError message={errors.amount} />
          {debt || !existing ? <><Pressable accessibilityRole="button" accessibilityLabel="Debt account" disabled={locked} onPress={()=>setPicker(true)} style={[input,{flexDirection:'row',alignItems:'center',gap:8,borderColor:errors.account ? theme.error : theme.border}]}>
            {selectedAccount ? <AccountIcon account={selectedAccount} color={theme.textSecondary} /> : null}<ThemedText type="small">{selectedAccount?.name ?? (debt?.kind === 'owed' || !debt && kind === 'owe' ? 'Received into' : 'Paid from')}</ThemedText>
          </Pressable><FieldError message={errors.account} /></> : null}
          <TransactionDateTime dateError={errors.date} timeError={errors.time} date={dateTime.transactionDate} time={dateTime.transactionTime} disabled={locked} onDateChange={transactionDate=>{setDateTime({...dateTime,transactionDate});clearErrors();}} onTimeChange={transactionTime=>{setDateTime({...dateTime,transactionTime});clearErrors();}} />
          <TextInput accessibilityLabel="Debt note" value={notes} onChangeText={setNotes} editable={!locked} placeholder="Note (optional)" placeholderTextColor={theme.textSecondary} selectionColor={theme.accent} cursorColor={theme.accent} underlineColorAndroid="transparent" style={input} />
          {after !== undefined ? <ThemedText type="small">Account balance after saving: {formatMoney(after)}</ThemedText> : null}
          {after !== undefined && after < 0 ? <ThemedText type="small" themeColor="warning">This will leave a negative account balance.</ThemedText> : null}
          <ActionButton primary label={working ? 'Saving...' : debt ? 'Save repayment' : 'Save debt'} disabled={locked || Boolean(errors.amount)} onPress={()=>{void save();}} />
          {!debt ? <ActionButton label="Cancel" disabled={locked} onPress={()=>{if(!pending.current)leave();}} /> : null}
        </View> : null}
        {debt ? <View style={{gap:10}}>
          <ThemedText type="smallBold">Repayment history</ThemedText>
          {!payments.length ? <ThemedText type="small" themeColor="textSecondary">No repayments yet.</ThemedText> : payments.map(payment=><View key={payment.id} style={{padding:12,borderRadius:12,backgroundColor:theme.backgroundElement,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1,gap:4}}><ThemedText type="smallBold">{formatAmount(payment.amount)} | {finance.accounts.find(row=>row.id===payment.accountId)?.name}</ThemedText><ThemedText type="small">{formatTransactionDateTime(payment.transactionDate,payment.transactionTime)}</ThemedText>{payment.notes ? <ThemedText type="small">{payment.notes}</ThemedText> : null}</View><IconButton icon="trash-outline" label="Delete repayment" destructive disabled={locked} onPress={()=>remove(payment)} /></View>)}
          <Pressable accessibilityRole="button" accessibilityLabel="Delete debt" disabled={locked} onPress={()=>remove()} style={{padding:14,borderRadius:12,alignItems:'center',backgroundColor:theme.errorSurface}}><ThemedText type="smallBold" themeColor="error">Delete debt</ThemedText></Pressable>
        </View> : null}
      </>}
      <SelectionSheet visible={picker && Boolean(debt || !existing)} title="Choose account" selected={accountId} disabled={locked} options={finance.accounts.filter(row=>!row.archived).map(row=>({value:row.id,label:row.name,leading:<AccountIcon account={row} color={theme.textSecondary} />}))} onClose={()=>setPicker(false)} onSelect={value=>{setAccountId(value);clearErrors();}} />
      <SelectionSheet visible={entryOpen && !id} title="When did this happen?" selected={existing ? 'existing' : 'new'} disabled={locked} options={[{value:'new',label:'Just now'},{value:'existing',label:'Already happened'}]} onClose={()=>setEntryOpen(false)} onSelect={value=>{setExisting(value==='existing');setEntryOpen(false);clearErrors();}} />
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
