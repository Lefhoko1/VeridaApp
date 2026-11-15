import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Text, TouchableRipple } from 'react-native-paper';

import { BrandLogo, Button, Kicker, palette, supporting } from '@/design-system';

// The public landing page, from the Verida_Hero_Image_Right_Updated design. It describes Verida and
// leads to registration and sign-in; it has no data of its own.

const IMAGES = {
  hero: require('../../../../../assets/scenes/business-owners.png'),
  retail: require('../../../../../assets/landing/industry-retail.svg'),
  salon: require('../../../../../assets/landing/industry-salon.svg'),
  services: require('../../../../../assets/landing/industry-services.svg'),
  farm: require('../../../../../assets/landing/farm-scene.png'),
  growth: require('../../../../../assets/landing/growth.png'),
};

type SectionKey = 'home' | 'industries' | 'features' | 'how' | 'platform';

const NAV: { key: SectionKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'industries', label: 'Industries' },
  { key: 'features', label: 'Features' },
  { key: 'how', label: 'How it works' },
  { key: 'platform', label: 'Platform' },
];

const BENEFITS = ['Sales & expense tracking', 'Business insights', 'Practical learning', 'AI guidance'];
const TRUST = ['Retail', 'Beauty & wellness', 'Professional services', 'Agriculture', 'And more'];

const INDUSTRIES = [
  { image: IMAGES.retail, title: 'Shops & retail', body: 'Keep sales, purchases, expenses and business performance organised.', alt: 'Illustration of a retail storefront' },
  { image: IMAGES.salon, title: 'Salons & beauty', body: 'Track services, operating costs and business income in one place.', alt: 'Illustration representing a beauty and wellness business' },
  { image: IMAGES.services, title: 'Service businesses', body: 'Understand income, costs and the activities behind your growth.', alt: 'Illustration of performance growth for a service business' },
  { image: IMAGES.farm, title: 'Farms & agriculture', body: 'Record sales, expenses and everyday operations with greater clarity.', alt: 'Illustration of a poultry farm' },
];

const FEATURES = [
  { icon: 'notebook-edit-outline', title: 'Records', body: 'Capture sales, expenses and day-to-day business activity in a structured workspace.' },
  { icon: 'chart-line', title: 'Insights', body: 'See useful trends, financial performance and areas worth your attention.' },
  { icon: 'school-outline', title: 'Learn', body: 'Build your business knowledge through practical, easy-to-follow lessons.' },
  { icon: 'creation-outline', title: 'Ask Verida', body: 'Get AI-assisted explanations and guidance to help you think through business decisions.' },
];

const CHECKS = ['Understand where revenue comes from.', 'Stay on top of business expenses.', 'Recognise patterns in performance.', 'Build confidence with learning and guidance.'];

const STEPS = [
  { number: '01', title: 'Set up', body: 'Create your business workspace and get organised from the start.' },
  { number: '02', title: 'Keep records', body: 'Record sales, expenses and relevant activities as your business operates.' },
  { number: '03', title: 'Learn & grow', body: "Use your insights and Verida's learning tools to guide your next steps." },
];

const PREVIEW_BARS = [0.38, 0.49, 0.46, 0.68, 0.63, 0.87];

type Size = 'phone' | 'tablet' | 'desktop';

function useSize(): Size {
  const { width } = useWindowDimensions();
  if (width >= 980) return 'desktop';
  if (width >= 720) return 'tablet';
  return 'phone';
}

export function LandingScreen({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  const size = useSize();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Where each section starts, so the navigation links can scroll to it.
  const [offsets, setOffsets] = useState<Partial<Record<SectionKey, number>>>({});
  const remember = (key: SectionKey) => (event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    setOffsets((current) => (current[key] === y ? current : { ...current, [key]: y }));
  };
  const goTo = (key: SectionKey) => scroll.current?.scrollTo({ y: offsets[key] ?? 0, animated: true });

  const phone = size === 'phone';
  const columns = size === 'desktop' ? 4 : 2;

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <View style={styles.top} role="banner">
        <Container style={styles.topInner}>
          <TouchableRipple onPress={() => goTo('home')} accessibilityRole="link" accessibilityLabel="Verida, back to top">
            <BrandLogo size={phone ? 26 : 31} />
          </TouchableRipple>
          {phone ? null : (
            <View style={styles.navLinks} role="navigation" aria-label="Main navigation">
              {NAV.map((item) => (
                <TouchableRipple key={item.key} onPress={() => goTo(item.key)} accessibilityRole="link" style={styles.navLink}>
                  <Text style={styles.navText}>{item.label}</Text>
                </TouchableRipple>
              ))}
            </View>
          )}
          <View style={styles.actions}>
            <Button mode="outlined" compact={phone} textColor={palette.deepTeal} onPress={onSignIn}>
              Sign in
            </Button>
            <Button mode="contained" compact={phone} onPress={onGetStarted}>
              Get started →
            </Button>
          </View>
        </Container>
      </View>

      <ScrollView ref={scroll} role="main">
        <View onLayout={remember('home')}>
          <Container style={[styles.hero, size !== 'phone' && styles.heroRow]}>
            <View style={styles.heroCopy}>
              <Kicker>✦ Your business. Clearer decisions.</Kicker>
              <Text style={[styles.h1, size === 'tablet' && styles.h1Tablet, phone && styles.h1Phone]} role="heading" aria-level={1}>
                Every business deserves a <Text style={styles.h1Accent}>clearer way to grow.</Text>
              </Text>
              <Text style={styles.lead}>
                Meet Verida: one simple workspace to manage business records, understand your finances, learn practical skills, and make more confident decisions—whatever business you run.
              </Text>
              <View style={styles.buttonRow}>
                <Button mode="contained" onPress={onGetStarted}>
                  Start with Verida →
                </Button>
                <Button mode="outlined" textColor={palette.deepTeal} onPress={() => goTo('how')}>
                  See how it works ↗
                </Button>
              </View>
              <View style={styles.benefits}>
                {BENEFITS.map((benefit) => (
                  <Text key={benefit} style={styles.benefit}>
                    <Text style={styles.tick}>✓ </Text>
                    {benefit}
                  </Text>
                ))}
              </View>
            </View>
            <View style={[styles.heroArt, size !== 'phone' && styles.heroArtWide]}>
              <Image source={IMAGES.hero} style={[styles.heroImage, phone && styles.heroImagePhone]} contentFit="cover" accessible accessibilityLabel="Two business owners reviewing their performance together on a tablet" />
              <View style={[styles.floatLabel, phone && styles.floatLabelPhone]}>
                <Text style={styles.floatText}>A clearer view of your business</Text>
                <Text style={styles.floatValue}>↗ Grow smarter</Text>
              </View>
            </View>
          </Container>
        </View>

        <View style={styles.trust}>
          <Container style={styles.trustInner}>
            <Text style={styles.trustTitle}>Built for the way you do business</Text>
            {TRUST.map((item) => (
              <Text key={item} style={styles.trustChip}>
                {item}
              </Text>
            ))}
          </Container>
        </View>

        <Section soft onLayout={remember('industries')} phone={phone}>
          <SectionHeading kicker="One platform. Many businesses." title="Made for entrepreneurs across industries." body="Different businesses, similar challenges. Verida gives owners the tools to stay organised and understand what matters." />
          <Grid columns={columns}>
            {INDUSTRIES.map((industry) => (
              <View key={industry.title} style={styles.industry}>
                <Image source={industry.image} style={[styles.industryImage, phone && styles.industryImagePhone]} contentFit="cover" accessible accessibilityLabel={industry.alt} />
                <View style={[styles.industryCopy, phone && styles.industryCopyPhone]}>
                  <Text style={[styles.cardTitle, phone && styles.cardTitlePhone]} role="heading" aria-level={3}>
                    {industry.title}
                  </Text>
                  <Text style={styles.cardBody}>{industry.body}</Text>
                </View>
              </View>
            ))}
          </Grid>
        </Section>

        <Section onLayout={remember('features')} phone={phone}>
          <SectionHeading kicker="The Verida workspace" title="Everything important, beautifully connected." body="Less time chasing paperwork and spreadsheets. More time understanding your business and making progress." />
          <Grid columns={columns}>
            {FEATURES.map((feature) => (
              <View key={feature.title} style={[styles.feature, phone && styles.featurePhone]}>
                <View style={styles.featureIcon}>
                  <Icon source={feature.icon} size={23} color={palette.teal} />
                </View>
                <Text style={styles.cardTitle} role="heading" aria-level={3}>
                  {feature.title}
                </Text>
                <Text style={styles.cardBody}>{feature.body}</Text>
              </View>
            ))}
          </Grid>
        </Section>

        <Section soft phone={phone}>
          <View style={[styles.split, !phone && styles.splitRow]}>
            <View style={styles.splitHalf}>
              <Image source={IMAGES.growth} style={styles.growthImage} contentFit="contain" accessible accessibilityLabel="Illustration of a rising financial chart" />
            </View>
            <View style={styles.splitHalf}>
              <Kicker>Designed for clarity</Kicker>
              <Text style={[styles.h2, styles.h2Left]} role="heading" aria-level={2}>
                See the whole picture, not just the numbers.
              </Text>
              <Text style={styles.body}>Verida helps business owners move from scattered information to an organised view of what is happening and what deserves attention.</Text>
              <View style={styles.checks}>
                {CHECKS.map((check) => (
                  <View key={check} style={styles.check}>
                    <View style={styles.checkDot}>
                      <Text style={styles.checkMark}>✓</Text>
                    </View>
                    <Text style={styles.checkText}>{check}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Section>

        <Section onLayout={remember('how')} phone={phone}>
          <SectionHeading kicker="Simple by design" title="Three steps to a smarter business." />
          <View style={[styles.steps, !phone && styles.stepsRow]}>
            {STEPS.map((step) => (
              <View key={step.number} style={styles.step}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.number}</Text>
                </View>
                <Text style={styles.stepTitle} role="heading" aria-level={3}>
                  {step.title}
                </Text>
                <Text style={[styles.cardBody, styles.center]}>{step.body}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section soft onLayout={remember('platform')} phone={phone}>
          <LinearGradient colors={[palette.deepTeal, '#206E6D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.preview, !phone && styles.previewRow, phone && styles.previewPhone]}>
            <View style={styles.previewCopy}>
              <Kicker inverse>Your business at a glance</Kicker>
              <Text style={[styles.h2, styles.h2Left, styles.onDark]} role="heading" aria-level={2}>
                A calm workspace for confident decisions.
              </Text>
              <Text style={styles.previewBody}>See your performance, financial trends, records and useful recommendations without unnecessary complexity.</Text>
              <View style={styles.buttonRow}>
                <Button mode="contained" buttonColor={supporting.white} textColor={palette.deepTeal} onPress={onGetStarted}>
                  Explore the possibilities ↗
                </Button>
              </View>
            </View>
            <View style={styles.dashboard} accessible accessibilityRole="image" accessibilityLabel="Example business dashboard with revenue, expenses, profit and a six-month trend">
              <View style={styles.dashTop}>
                <Text style={styles.dashTitle}>Business overview</Text>
                <Text style={styles.dashSmall}>Last six months</Text>
              </View>
              <View style={styles.kpis}>
                {[
                  ['Revenue', 'P 24,850'],
                  ['Expenses', 'P 9,420'],
                  ['Profit', 'P 15,430'],
                ].map(([label, value]) => (
                  <View key={label} style={styles.kpi}>
                    <Text style={styles.kpiLabel}>{label}</Text>
                    <Text style={[styles.kpiValue, phone && styles.kpiValuePhone]}>{value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.chart}>
                {[1, 2, 3].map((line) => (
                  <View key={line} style={[styles.chartLine, { bottom: line * 38 }]} />
                ))}
                {PREVIEW_BARS.map((ratio, index) => (
                  <LinearGradient key={index} colors={['#38A396', palette.teal]} style={[styles.chartBar, { height: `${ratio * 100}%` }]} />
                ))}
              </View>
              <Text style={styles.dashNote}>Illustrative dashboard data · Revenue trend</Text>
            </View>
          </LinearGradient>
        </Section>

        <Section phone={phone}>
          <View style={[styles.cta, !phone && styles.ctaRow]}>
            <View style={styles.fill}>
              <Text style={styles.ctaTitle} role="heading" aria-level={2}>
                Build a stronger business with Verida.
              </Text>
              <Text style={styles.ctaBody}>Better records. Better understanding. Better decisions.</Text>
            </View>
            <Button mode="contained" buttonColor={supporting.white} textColor={palette.deepTeal} onPress={onGetStarted}>
              Get started →
            </Button>
          </View>
        </Section>

        <View style={styles.footer} role="contentinfo">
          <Container style={[styles.footerInner, phone && styles.footerPhone]}>
            <BrandLogo size={26} />
            <Text style={styles.footerText}>© 2026 Verida · A business companion for growing enterprises</Text>
          </Container>
        </View>
      </ScrollView>
    </View>
  );
}

function Container({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.container, style]}>{children}</View>;
}

function Section({ children, soft, onLayout, phone }: { children: ReactNode; soft?: boolean; onLayout?: (event: LayoutChangeEvent) => void; phone: boolean }) {
  return (
    <View onLayout={onLayout} style={[styles.section, phone && styles.sectionPhone, soft && styles.soft]}>
      <Container>{children}</Container>
    </View>
  );
}

function SectionHeading({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Kicker>{kicker}</Kicker>
      <Text style={styles.h2} role="heading" aria-level={2}>
        {title}
      </Text>
      {body ? <Text style={[styles.body, styles.center]}>{body}</Text> : null}
    </View>
  );
}

function Grid({ children, columns }: { children: ReactNode[]; columns: number }) {
  return (
    <View style={styles.grid}>
      {children.map((child, index) => (
        <View key={index} style={{ width: `${100 / columns}%`, padding: 8 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

const DEEP_INK = '#142F35';

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: supporting.white },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  container: { width: '100%', maxWidth: 1260, alignSelf: 'center', paddingHorizontal: 24 },
  top: { backgroundColor: supporting.white, borderBottomWidth: 1, borderBottomColor: '#E8EEEB', zIndex: 2 },
  topInner: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  navLinks: { flexDirection: 'row', gap: 8 },
  navLink: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  navText: { fontSize: 13, fontWeight: '600', color: supporting.ink },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hero: { paddingTop: 48, paddingBottom: 60, gap: 32 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 48, paddingTop: 65, paddingBottom: 75 },
  heroCopy: { flex: 1, gap: 20 },
  h1: { fontSize: 64, lineHeight: 70, fontWeight: '800', letterSpacing: -3, color: DEEP_INK },
  h1Tablet: { fontSize: 48, lineHeight: 54, letterSpacing: -2 },
  h1Phone: { fontSize: 40, lineHeight: 46, letterSpacing: -1.6 },
  h1Accent: { color: palette.teal },
  lead: { fontSize: 16, lineHeight: 29, color: supporting.mutedText, maxWidth: 550 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 19, rowGap: 11 },
  benefit: { fontSize: 12, color: supporting.navText },
  tick: { color: supporting.success, fontWeight: '800' },
  heroArt: { position: 'relative' },
  heroArtWide: { flex: 1.1 },
  heroImage: { width: '100%', height: 510, borderRadius: 24, boxShadow: '0px 18px 48px rgba(21, 60, 70, 0.09)' },
  heroImagePhone: { height: 330 },
  floatLabel: { position: 'absolute', bottom: 23, left: -17, paddingVertical: 15, paddingHorizontal: 19, borderRadius: 13, backgroundColor: supporting.white, boxShadow: '0px 12px 35px rgba(21, 60, 70, 0.14)' },
  floatLabelPhone: { left: 12 },
  floatText: { fontSize: 11, color: supporting.mutedText },
  floatValue: { fontSize: 23, fontWeight: '800', color: palette.teal, marginTop: 4 },
  trust: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: supporting.line, paddingVertical: 21 },
  trustInner: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 },
  trustTitle: { fontSize: 12, fontWeight: '700', color: palette.deepTeal, marginRight: 12 },
  trustChip: { fontSize: 12, color: supporting.mutedText, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: '#F3F8F5', borderRadius: 100, overflow: 'hidden' },
  section: { paddingVertical: 87 },
  sectionPhone: { paddingVertical: 62 },
  soft: { backgroundColor: supporting.pageWash },
  sectionHeading: { maxWidth: 670, alignSelf: 'center', alignItems: 'center', gap: 16, marginBottom: 31 },
  h2: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1.6, color: palette.deepTeal, textAlign: 'center' },
  h2Left: { textAlign: 'left' },
  body: { fontSize: 14, lineHeight: 25, color: supporting.mutedText },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -8 },
  industry: { flex: 1, backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line, borderRadius: 17, overflow: 'hidden', boxShadow: '0px 6px 20px rgba(21, 60, 70, 0.03)' },
  industryImage: { width: '100%', height: 175, backgroundColor: palette.softMint },
  industryImagePhone: { height: 125 },
  industryCopy: { paddingTop: 18, paddingHorizontal: 19, paddingBottom: 22, gap: 8 },
  industryCopyPhone: { padding: 13 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: palette.deepTeal },
  cardTitlePhone: { fontSize: 14 },
  cardBody: { fontSize: 12, lineHeight: 21, color: supporting.mutedText },
  feature: { flex: 1, paddingVertical: 26, paddingHorizontal: 22, borderWidth: 1, borderColor: supporting.line, borderRadius: 16, backgroundColor: supporting.white, gap: 9 },
  featurePhone: { paddingVertical: 19, paddingHorizontal: 15 },
  featureIcon: { width: 49, height: 49, borderRadius: 13, backgroundColor: supporting.eyebrowWash, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  split: { gap: 30 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 75 },
  splitHalf: { flex: 1, gap: 17 },
  growthImage: { width: '100%', aspectRatio: 1.3, borderRadius: 24, backgroundColor: '#EEF6F1' },
  checks: { gap: 17, marginTop: 7 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkDot: { width: 23, height: 23, borderRadius: 12, backgroundColor: '#E4F3EB', alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: palette.teal, fontWeight: '800', fontSize: 12 },
  checkText: { flex: 1, fontSize: 13, color: '#375459' },
  steps: { gap: 0 },
  stepsRow: { flexDirection: 'row', gap: 24 },
  step: { flex: 1, padding: 28, alignItems: 'center', gap: 10 },
  stepNumber: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.softMint, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  stepNumberText: { fontSize: 19, fontWeight: '800', color: palette.teal },
  stepTitle: { fontSize: 19, fontWeight: '700', color: supporting.ink },
  preview: { borderRadius: 24, padding: 43, gap: 35 },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  previewPhone: { padding: 25 },
  previewCopy: { flex: 0.8, gap: 16 },
  onDark: { color: supporting.white },
  previewBody: { color: '#D1E5DF', fontSize: 13, lineHeight: 23 },
  dashboard: { flex: 1.2, backgroundColor: supporting.pageWash, borderRadius: 14, padding: 18, boxShadow: '0px 18px 45px rgba(11, 41, 49, 0.25)' },
  dashTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  dashTitle: { fontSize: 14, fontWeight: '800', color: palette.deepTeal },
  dashSmall: { fontSize: 10, color: supporting.mutedText },
  kpis: { flexDirection: 'row', gap: 9 },
  kpi: { flex: 1, backgroundColor: supporting.white, borderWidth: 1, borderColor: '#E4ECE7', borderRadius: 9, padding: 13 },
  kpiLabel: { fontSize: 10, color: supporting.mutedText },
  kpiValue: { fontSize: 19, fontWeight: '800', color: palette.deepTeal, marginTop: 6 },
  kpiValuePhone: { fontSize: 15 },
  chart: { height: 150, marginTop: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: 10, borderBottomWidth: 1, borderBottomColor: supporting.axisLine },
  chartLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: supporting.gridLine },
  chartBar: { width: 27, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  dashNote: { color: supporting.mutedText, fontSize: 10, marginTop: 11 },
  cta: { borderRadius: 23, backgroundColor: palette.deepTeal, paddingVertical: 30, paddingHorizontal: 30, gap: 22 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 44, paddingHorizontal: 50, gap: 25 },
  ctaTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1, color: supporting.white, marginBottom: 9 },
  ctaBody: { fontSize: 13, color: '#D0E5DF' },
  footer: { borderTopWidth: 1, borderTopColor: supporting.line, paddingVertical: 34 },
  footerInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 20 },
  footerPhone: { flexDirection: 'column', alignItems: 'flex-start' },
  footerText: { fontSize: 12, color: supporting.mutedText },
});
