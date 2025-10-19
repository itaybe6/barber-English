import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Image, StyleSheet } from 'react-native';

interface WaitlistClientCardProps {
  name: string;
  image: string;
  time: string;
  type: string;
  tag?: string;
}

export default function WaitlistClientCard({
  name,
  image,
  time,
  type,
  tag,
}: WaitlistClientCardProps) {
  const { t } = useTranslation();
  const hasImage = Boolean(image && image.trim().length > 0);
  const placeholder = require('@/assets/images/user.png');
  
  return (
    <View style={styles.card}>
      <Image source={hasImage ? { uri: image } : placeholder} style={styles.avatar} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
        <Text style={styles.type} numberOfLines={1} ellipsizeMode="tail">{type}</Text>
        <Text style={styles.time} numberOfLines={1} ellipsizeMode="tail">{time}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag || t('admin.waitlist.waiting', 'Waiting')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
    minHeight: 70,
    gap: 12,
    overflow: 'hidden',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#eee',
  },
  content: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
    textAlign: 'left',
    flexShrink: 1,
    marginBottom: 2,
  },
  type: {
    fontSize: 14,
    color: '#888',
    textAlign: 'left',
    flexShrink: 1,
    maxWidth: '100%',
    marginBottom: 2,
  },
  time: {
    fontSize: 13,
    color: '#7B61FF',
    textAlign: 'left',
    flexShrink: 0,
    marginBottom: 4,
  },
  tag: {
    backgroundColor: '#EAF3FF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#D6EBFF',
  },
  tagText: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'left',
  },
});
