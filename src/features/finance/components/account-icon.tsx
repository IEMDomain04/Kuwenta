import { Image } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import type { Account } from '../types';
const assets = {
  gcash: require('../../../../assets/images/bank-icons/gcash-icon.jpg'),
  maya: require('../../../../assets/images/bank-icons/maya-icon.png'),
  maribank: require('../../../../assets/images/bank-icons/maribank-icon.jpeg'),
  gotyme: require('../../../../assets/images/bank-icons/gotyme-icon.png'),
  uniondigital: require('../../../../assets/images/bank-icons/uniondigital-icon.png'),
};
export function AccountIcon({ account, size = 24, color }: { account: Pick<Account, 'icon' | 'purpose'>; size?: number; color: string }) {
  const icon = account.icon;
  if (icon && icon in assets) return <Image source={assets[icon as keyof typeof assets]} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size / 5 }} resizeMode="contain" />;
  return <Ionicons name={icon === 'bank' ? 'business-outline' : !icon && account.purpose === 'savings' ? 'shield-checkmark-outline' : 'wallet-outline'} size={size} color={color} />;
}
