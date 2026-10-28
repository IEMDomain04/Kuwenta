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
import { formatMoney, moneyInput, parseMoney } from '../money';
import { philippineDateTime, formatTransactionDateTime, readableTransactionDate, isValidDate, isValidTime } from '../dates';
import { ActionButton, BackButton, FinanceScreen, IconButton } from '../components/ui';
import { useConfirmation } from '../components/confirmation';
import { MoneyField } from '../components/money-field';
import { TransactionDateTime } from '../components/transaction-date-time';
import { SelectionSheet } from '../components/selection-sheet';
import { AccountIcon } from '../components/account-icon';
import { FieldError } from '../components/field-error';
import type { Debt, DebtPayment, DebtAddition } from '../types';

export default function DebtScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const { formatAmount } = useAmountVisibility();
  const confirmation = useConfirmation();
  const debt = finance.debts.find(row => row.id === id);
  const payments = finance.debtPayments.filter(row => row.debtId === id);
  const additions = (finance.debtAdditions ?? []).filter(row => row.debtId === id);
  const progress = debt ? debtProgress(debt,payments,additions) : undefined;
  const [mode,setMode] = useState<'repayment' | 'addition' | 'correction'>('repayment');
  const correctionExpected = useRef<number | undefined>(undefined);
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
  const correction = Boolean(debt && mode === 'correction');
  const borrowing = !debt || mode === 'addition';
  const movesMoney = correction ? !debt?.existing : !borrowing || !existing;
  function changeMode(next: typeof mode) {
    if (pending.current || locked) return;
    setMode(next); setExisting(false); setAmount(next === 'correction' && debt ? moneyInput(debt.amount) : '');
    correctionExpected.current = next === 'correction' ? debt?.amount : undefined;
    setAccountId(next === 'correction' ? debt?.accountId ?? '' : '');
    setNotes(''); setDateTime(philippineDateTime()); setErrors({}); submission.current = undefined;
  }
  let after: number | undefined;
  try {
    if(selectedAccount && movesMoney) {
      const direction = borrowing || correction ? (debt?.kind ?? kind) === 'owe' : debt?.kind === 'owed';
      const change = BigInt(parseMoney(amount.replace(/,/g,''))) - (correction ? BigInt(debt!.amount) : 0n);
      const value = BigInt(calculateAccountSummary(selectedAccount,finance.transactions,'1900-01').balance) + change * (direction ? 1n : -1n);
      if(value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) after = Number(value);
    }
  } catch { /* Incomplete fields are checked on Save. */ }
  async function persist(cents: number) {
    try {
      if (correction && debt) {
        await finance.correctDebtAmount(debt.id,cents,correctionExpected.current ?? debt.amount);
      } else {
        const recordId = submission.current ??= await finance.newSubmissionId();
        const now = new Date().toISOString();
        if (debt && mode === 'addition') {
          const addition: DebtAddition = { id:recordId,debtId:debt.id,accountId:existing ? undefined : accountId,existing:existing || undefined,amount:cents,...dateTime,notes:notes.trim() || undefined,createdAt:now };
          await finance.addDebtAmount(addition);
        } else if (debt) {
          const payment: DebtPayment = { id:recordId,debtId:debt.id,accountId,amount:cents,...dateTime,notes:notes.trim() || undefined,createdAt:now };
          await finance.payDebt(payment);
        } else {
          const record: Debt = { id:recordId,name:name.trim(),kind,existing:existing || undefined,accountId:existing ? undefined : accountId,amount:cents,...dateTime,notes:notes.trim() || undefined,createdAt:now,updatedAt:now };
          await finance.addDebt(record); leave();
        }
      }
      submission.current = undefined; setAmount(''); setNotes(''); setErrors({}); setMode('repayment'); setExisting(false);
    } catch(cause) { finance.showNotice(cause instanceof Error ? cause.message : 'Could not save the debt record.',true); }
    finally { pending.current = false; setWorking(false); }
  }
  async function save() {
    if(pending.current || locked || (id && !debt)) return;
    const next: Record<string,string> = {};
    if(!debt && !name.trim()) next.name = "Enter the person's name.";
    if(movesMoney && !correction && (!selectedAccount || selectedAccount.archived)) next.account = 'Choose an active account.';
    let cents = 0;
    try { cents = parseMoney(amount.replace(/,/g,'')); } catch { next.amount = 'Enter an amount greater than zero, with up to two decimal places.'; }
    if(!correction) {
      if(!isValidDate(dateTime.transactionDate)) next.date = 'Choose a valid date.';
      if(!isValidTime(dateTime.transactionTime)) next.time = 'Choose a valid time.';
      if(debt && dateTime.transactionDate + dateTime.transactionTime < debt.transactionDate + debt.transactionTime) next.date = 'Date cannot be before the original debt.';
    }
    if(debt && mode === 'repayment' && cents > progress!.remaining) next.amount = 'Repayment cannot exceed the remaining debt.';
    if(correction && cents + progress!.added < progress!.paid) next.amount = 'Total borrowed cannot be less than the repayments.';
    if(Object.keys(next).length) { setErrors(next); return; }
    pending.current = true;
    if(correction && debt) {
      let confirmed = false;
      confirmation.alert('Correct original amount?','This corrects the first entry. Later borrowing and repayments stay unchanged.',[
        {text:'Cancel',style:'cancel',onPress:()=>{pending.current=false;}},
        {text:'Confirm',onPress:()=>{if(confirmed)return;confirmed=true;setWorking(true);void persist(cents);}},
      ],{icon:'create-outline',rows:[{label:'Person',value:debt.name}, ...(after === undefined ? [] : [{label:'Account balance after saving',value:formatMoney(after)}])],change:{label:'Original amount',before:formatMoney(debt.amount),after:formatMoney(cents)}});
    } else { setWorking(true); await persist(cents); }
  }
  function removeAddition(addition: DebtAddition) {
    if(!debt || pending.current || locked)return;
    pending.current=true; let confirmed=false;
    confirmation.alert('Delete borrowing?','Removes this added borrowing and reverses its account movement, if any. Repayments stay unchanged.',[
      {text:'Cancel',style:'cancel',onPress:()=>{pending.current=false;}},
      {text:'Delete',style:'destructive',onPress:()=>{if(confirmed)return;confirmed=true;setWorking(true);void finance.removeDebtAddition(addition.id).catch(cause=>finance.showNotice(cause instanceof Error ? cause.message : 'Could not delete.',true)).finally(()=>{pending.current=false;setWorking(false);});}},
    ],{icon:'trash-outline',rows:[{label:'Person',value:debt.name},{label:'Added borrowing',value:formatMoney(addition.amount)}]});
  }
  function remove(payment?: DebtPayment) {
    if(!debt || pending.current || locked) return;
    pending.current = true; let confirmed = false;
    confirmation.alert(payment ? 'Delete repayment?' : 'Delete debt?',payment ? 'Removes this repayment and reverses its account balance movement.' : debt.existing ? 'Removes this debt, added borrowing and repayments. Recorded account movements are reversed.' : 'Removes this debt, added borrowing and all repayments, reversing their account balance movements.',[
      { text:'Cancel',style:'cancel',onPress:()=>{pending.current=false;} },
      { text:'Delete',style:'destructive',onPress:()=>{
        if(confirmed)return;confirmed=true;setWorking(true);
        void finance.removeDebt(payment?.id ?? debt.id,Boolean(payment)).then(()=>{if(!payment)leave();}).catch(cause=>finance.showNotice(cause instanceof Error ? cause.message : 'Could not delete.',true)).finally(()=>{pending.current=false;setWorking(false);});
      } },
    ],{icon:'trash-outline',rows:[{label:'Person',value:debt.name},{label:payment ? 'Repayment' : 'Original debt',value:formatMoney(payment?.amount ?? debt.amount)}]});
  }
  return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title={id ? 'Debt details' : 'Add debt'} tabScreen={false} headerAccessory={debt ? <IconButton icon="trash-outline" destructive label="Delete debt" disabled={locked} onPress={()=>remove()} /> : undefined} headerLeading={<BackButton disabled={locked} onPress={()=>{if(!pending.current)leave();}} />}>
      {id && !debt ? <ThemedText>This debt is no longer available.</ThemedText> : <>
        {debt ? <View style={{padding:14,borderRadius:16,backgroundColor:theme.backgroundElement,gap:8}}>
          <ThemedText type="smallBold">{debt.name} | {debt.kind === 'owe' ? 'I owe' : 'Owed to me'}</ThemedText>
          <ThemedText type="subtitle">{formatAmount(progress!.remaining)} remaining</ThemedText>
          <ThemedText type="small">Total borrowed: {formatAmount(progress!.totalBorrowed)} | Repaid: {formatAmount(progress!.paid)}</ThemedText>
          <ThemedText type="small">{progress!.settled ? 'Settled' : 'Outstanding'}{debt.dueDate ? ' | Due '+readableTransactionDate(debt.dueDate) : ''}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(debt.transactionDate,debt.transactionTime)} | {debt.existing ? 'Already happened' : finance.accounts.find(row=>row.id===debt.accountId)?.name}</ThemedText>
          {debt.notes ? <ThemedText type="small">{debt.notes}</ThemedText> : null}
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
            <ActionButton compact label="Add borrowed amount" selected={mode==='addition'} disabled={locked} onPress={()=>changeMode('addition')} />
            <ActionButton compact label="Edit original amount" selected={mode==='correction'} disabled={locked} onPress={()=>changeMode('correction')} />
          </View>
        </View> : null}
        {(!progress?.settled || mode !== 'repayment') ? <View style={{padding:14,borderRadius:16,backgroundColor:theme.backgroundElement,gap:10}}>
          {!debt || mode==='addition' ? <>
            {!debt ? <><View style={{flexDirection:'row',gap:8}}><ActionButton compact selected={kind==='owe'} label="I owe" disabled={locked} onPress={()=>setKind('owe')} /><ActionButton compact selected={kind==='owed'} label="Owed to me" disabled={locked} onPress={()=>setKind('owed')} /></View>
            <TextInput accessibilityLabel="Person name" value={name} onChangeText={value=>{setName(value);clearErrors();}} editable={!locked} placeholder="Person's name" placeholderTextColor={theme.textSecondary} selectionColor={theme.accent} cursorColor={theme.accent} underlineColorAndroid="transparent" style={[input,{borderColor:errors.name ? theme.error : theme.border}]} />
            <FieldError message={errors.name} /></> : <ThemedText type="smallBold">Add borrowed amount</ThemedText>}
            <ThemedText type="small">When did this happen?</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="When did this happen?" disabled={locked} onPress={()=>setEntryOpen(true)} style={[input,{flexDirection:'row',alignItems:'center',gap:8}]}>
              <ThemedText type="small" style={{flex:1}}>{existing ? 'Already happened' : 'Just now'}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>
            <ThemedText type="small">{existing ? 'Track the debt without changing my balance.' : 'Update my account balance.'}</ThemedText>

          </> : <ThemedText type="smallBold">{correction ? 'Correct the original entry' : debt.kind==='owe' ? 'Record money repaid' : 'Record money received back'}</ThemedText>}
          <ThemedText type="small">{correction ? "Original amount (PHP)" : borrowing && existing ? "Amount still owed (PHP)" : "Amount (PHP)"}</ThemedText>
          <MoneyField accessibilityLabel={correction ? 'Original amount' : debt && mode==='addition' ? 'Additional borrowed amount' : debt ? 'Repayment amount' : 'Debt amount'} value={amount} editable={!locked} onValueChange={value=>{setAmount(value);clearErrors();}} onRejected={()=>setErrors({amount:'Use digits and up to two decimal places.'})} style={[input,{borderColor:errors.amount ? theme.error : theme.border}]} />
          <FieldError message={errors.amount} />
          {movesMoney && !correction ? <><Pressable accessibilityRole="button" accessibilityLabel="Debt account" disabled={locked} onPress={()=>setPicker(true)} style={[input,{flexDirection:'row',alignItems:'center',gap:8,borderColor:errors.account ? theme.error : theme.border}]}>
            {selectedAccount ? <AccountIcon account={selectedAccount} color={theme.textSecondary} /> : null}<ThemedText type="small">{selectedAccount?.name ?? ((borrowing ? (debt?.kind ?? kind) === 'owe' : debt?.kind === 'owed') ? 'Received into' : 'Paid from')}</ThemedText>
          </Pressable><FieldError message={errors.account} /></> : null}
          {!correction ? <><TransactionDateTime dateError={errors.date} timeError={errors.time} date={dateTime.transactionDate} time={dateTime.transactionTime} disabled={locked} onDateChange={transactionDate=>{setDateTime({...dateTime,transactionDate});clearErrors();}} onTimeChange={transactionTime=>{setDateTime({...dateTime,transactionTime});clearErrors();}} />
          <TextInput accessibilityLabel="Debt note" value={notes} onChangeText={setNotes} editable={!locked} placeholder="Note (optional)" placeholderTextColor={theme.textSecondary} selectionColor={theme.accent} cursorColor={theme.accent} underlineColorAndroid="transparent" style={input} /></> : <ThemedText type="small" themeColor="textSecondary">Use this only to fix the first amount. To record another borrowing, choose Add borrowed amount.</ThemedText>}
          {after !== undefined ? <ThemedText type="small">Account balance after saving: {formatMoney(after)}</ThemedText> : null}
          {after !== undefined && after < 0 ? <ThemedText type="small" themeColor="warning">This will leave a negative account balance.</ThemedText> : null}
          <ActionButton primary label={working ? 'Saving...' : correction ? 'Save correction' : debt && mode==='addition' ? 'Save borrowing' : debt ? 'Save repayment' : 'Save debt'} disabled={locked || Boolean(errors.amount)} onPress={()=>{void save();}} />
          {!debt || mode!=='repayment' ? <ActionButton label="Cancel" disabled={locked} onPress={()=>{if(!pending.current){if(debt)changeMode('repayment');else leave();}}} /> : null}
        </View> : null}
        {debt ? <View style={{gap:10}}>
          <ThemedText type="smallBold">Borrowing history</ThemedText>
          <ThemedText type="small">Original: {formatAmount(debt.amount)} | {formatTransactionDateTime(debt.transactionDate,debt.transactionTime)}</ThemedText>
          {additions.map(addition=><View key={addition.id} style={{padding:12,borderRadius:12,backgroundColor:theme.backgroundElement,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1,gap:4}}>
            <ThemedText type="smallBold">{formatAmount(addition.amount)} | {addition.existing ? 'Already happened' : finance.accounts.find(row=>row.id===addition.accountId)?.name}</ThemedText>
            <ThemedText type="small">{formatTransactionDateTime(addition.transactionDate,addition.transactionTime)}</ThemedText>
            {addition.notes ? <ThemedText type="small">{addition.notes}</ThemedText> : null}
          </View><IconButton icon="trash-outline" label="Delete borrowing" destructive disabled={locked} onPress={()=>removeAddition(addition)} /></View>)}
          <ThemedText type="smallBold">Repayment history</ThemedText>
          {!payments.length ? <ThemedText type="small" themeColor="textSecondary">No repayments yet.</ThemedText> : payments.map(payment=><View key={payment.id} style={{padding:12,borderRadius:12,backgroundColor:theme.backgroundElement,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1,gap:4}}><ThemedText type="smallBold">{formatAmount(payment.amount)} | {finance.accounts.find(row=>row.id===payment.accountId)?.name}</ThemedText><ThemedText type="small">{formatTransactionDateTime(payment.transactionDate,payment.transactionTime)}</ThemedText>{payment.notes ? <ThemedText type="small">{payment.notes}</ThemedText> : null}</View><IconButton icon="trash-outline" label="Delete repayment" destructive disabled={locked} onPress={()=>remove(payment)} /></View>)}
        </View> : null}
      </>}
      <SelectionSheet visible={picker && movesMoney && !correction} title="Choose account" selected={accountId} disabled={locked} options={finance.accounts.filter(row=>!row.archived).map(row=>({value:row.id,label:row.name,leading:<AccountIcon account={row} color={theme.textSecondary} />}))} onClose={()=>setPicker(false)} onSelect={value=>{setAccountId(value);clearErrors();}} />
      <SelectionSheet visible={entryOpen && borrowing} title="When did this happen?" selected={existing ? 'existing' : 'new'} disabled={locked} options={[{value:'new',label:'Just now'},{value:'existing',label:'Already happened'}]} onClose={()=>setEntryOpen(false)} onSelect={value=>{setExisting(value==='existing');setEntryOpen(false);clearErrors();}} />
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
