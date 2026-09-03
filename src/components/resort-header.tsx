import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from './themed-text';

const RESORT_PHOTOS = [
  require('@/assets/images/resort-1.jpg'),
  require('@/assets/images/resort-2.jpg'),
  require('@/assets/images/resort-3.jpg'),
];

interface ResortHeaderProps {
  title: string;
  subtitle: string;
  rightElement?: React.ReactNode;
}

export function ResortHeader({ title, subtitle, rightElement }: ResortHeaderProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: 700,
        useNativeDriver: true,
      }).start(() => {
        setPhotoIndex((prev) => (prev + 1) % RESORT_PHOTOS.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }).start();
      });
    }, 5500);

    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.headerContainer}>
      <Animated.Image
        source={RESORT_PHOTOS[photoIndex]}
        style={[
          styles.bgImage,
          { opacity: fadeAnim },
        ]}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(13, 110, 95, 0.88)', 'rgba(7, 66, 57, 0.95)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.headerContent}>
        <View style={styles.textColumn}>
          <ThemedText style={styles.titleText}>{title}</ThemedText>
          <ThemedText style={styles.subtitleText} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </View>

        {rightElement && (
          <View style={styles.rightSlot}>
            {rightElement}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: 'relative',
    height: 78,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 4,
  },
  bgImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    gap: 12,
  },
  textColumn: {
    flex: 1,
    gap: 3,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '500',
  },
  rightSlot: {
    alignItems: 'flex-end',
  },
});
