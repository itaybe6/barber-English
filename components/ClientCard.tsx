import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { Client } from '@/constants/clients';
import Colors from '@/constants/colors';
import Card from './Card';
import { useTranslation } from 'react-i18next';
import { Phone, Calendar } from 'lucide-react-native';

interface ClientCardProps {
  client: Client;
  onPress: (client: Client) => void;
}

export default function ClientCard({ client, onPress }: ClientCardProps) {
  const { t } = useTranslation();
  const formatDate = (dateString?: string) => {
    if (!dateString) return t('clients.noVisit', 'No visit yet');
    
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL');
  };
  
  return (
    <TouchableOpacity 
      onPress={() => onPress(client)}
      activeOpacity={0.7}
    >
      <Card style={styles.card}>
        <Image 
          source={{ uri: client.image || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330' }} 
          style={styles.image} 
        />
        <View style={styles.content}>
          <Text style={styles.name}>{client.name}</Text>
          
          <View style={styles.infoRow}>
            <Phone size={14} color={Colors.subtext} />
            <Text style={styles.infoText}>{client.phone}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Calendar size={14} color={Colors.subtext} />
            <Text style={styles.infoText}>{t('clients.lastVisit', 'Last visit')}: {formatDate(client.lastVisit)}</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 12,
    marginVertical: 6,
    alignItems: 'center',
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
    textAlign: 'right',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: Colors.subtext,
    marginLeft: 6,
    textAlign: 'right',
  },
});