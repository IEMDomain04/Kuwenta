import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { readableTransactionDate, formatTransactionDateTime } from '../../domain/dates';
import type { Transaction } from '../../domain/types';
import { ActionButton } from '../shared/ui';

export function SpendingDayDetails({ date, spent, transactions, compact = false }: { date: string; spent: number; transactions: readonly Transaction[]; compact?: boolean }) {
  const [expanded,setExpanded]=useState(false);const [limit,setLimit]=useState(5);
  const records=useMemo(()=>transactions.filter(row=>row.type==='EXPENSE'&&row.transactionDate===date).slice().sort((a,b)=>b.transactionTime.localeCompare(a.transactionTime)),[transactions,date]);
  const theme=useTheme();const {formatAmount,conceal}=useAmountVisibility();
  return <View testID="spending-day-details" style={{padding:compact?0:14,gap:8,borderRadius:18,backgroundColor:theme.backgroundElement}}>
    <ThemedText type="smallBold" accessibilityLiveRegion="polite">{readableTransactionDate(date)}: {formatAmount(spent)} spent</ThemedText>
    {expanded && records.slice(0,limit).map(record=><Pressable key={record.id} accessibilityRole="button" accessibilityLabel={'View '+conceal(record.notes?.trim()||record.category)+', '+formatAmount(record.amount)} onPress={()=>router.push({pathname:'/transaction',params:{id:record.exchangeParentId??record.id}})} style={{minHeight:44,gap:3,paddingVertical:6}}>
      <View style={{flexDirection:'row',gap:8}}><ThemedText type="small" style={{flex:1}}>{conceal(record.notes?.trim()||record.category)}</ThemedText><ThemedText type="smallBold">{formatAmount(record.amount)}</ThemedText></View>
      <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(record.transactionDate,record.transactionTime)}</ThemedText>
    </Pressable>)}
    {expanded && records.length>limit?<ActionButton compact label="Show more transactions" onPress={()=>setLimit(value=>value+5)}/>:null}
    {records.length ? <ActionButton compact label={expanded?'Hide transactions':'View transactions'} onPress={()=>{setExpanded(value=>!value);setLimit(5);}}/> : null}
  </View>;
}
