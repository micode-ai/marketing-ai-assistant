import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface MarketingCampaignEmailProps {
  subject: string;
  previewText: string;
  senderName: string;
  htmlContent: string;
  unsubscribeUrl: string;
  recipientEmail: string;
}

export const MarketingCampaignEmail: React.FC<MarketingCampaignEmailProps> = ({
  subject,
  previewText,
  senderName,
  htmlContent,
  unsubscribeUrl,
  recipientEmail,
}) => {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={contentSection}>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </Section>

          <Hr style={hr} />

          <Section style={footerSection}>
            <Text style={footer}>
              You received this email because you subscribed to {senderName} updates.
              <br />
              <Link href={unsubscribeUrl} style={unsubscribeLink}>
                Unsubscribe
              </Link>
              {' · '}
              <Text style={recipientText}>{recipientEmail}</Text>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '600px',
};

const contentSection = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '40px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '16px 0',
};

const footerSection = {
  padding: '0 20px',
};

const footer = {
  fontSize: '12px',
  lineHeight: '20px',
  color: '#9ca3af',
  textAlign: 'center' as const,
};

const unsubscribeLink = {
  color: '#6b7280',
  textDecoration: 'underline',
};

const recipientText = {
  display: 'inline',
  color: '#9ca3af',
  fontSize: '12px',
};

export default MarketingCampaignEmail;
