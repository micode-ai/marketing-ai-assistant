import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface PasswordResetEmailProps {
  userName: string;
  resetUrl: string;
  expiresIn?: string;
}

export const PasswordResetEmail: React.FC<PasswordResetEmailProps> = ({
  userName,
  resetUrl,
  expiresIn = '1 hour',
}) => {
  return (
    <Html>
      <Head />
      <Preview>Reset your Marketing AI Assistant password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>Marketing AI</Text>
          </Section>

          <Section style={contentSection}>
            <Heading style={heading}>Password Reset Request</Heading>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              We received a request to reset your password. Click the button below to create a new
              password:
            </Text>

            <Section style={buttonSection}>
              <Button style={button} href={resetUrl}>
                Reset Password
              </Button>
            </Section>

            <Text style={warningText}>
              ⚠️ This link will expire in {expiresIn}. If you didn&apos;t request a password reset,
              you can safely ignore this email.
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              For security reasons, this link can only be used once.
              <br />
              If you need help, contact us at support@marketingai.app
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
  maxWidth: '580px',
};

const logoSection = {
  padding: '32px 0 20px',
  textAlign: 'center' as const,
};

const logo = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#5b21b6',
  margin: '0',
};

const contentSection = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '40px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const heading = {
  fontSize: '24px',
  fontWeight: '600',
  color: '#1a1a2e',
  margin: '0 0 20px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#4a5568',
  margin: '0 0 16px',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#5b21b6',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};

const warningText = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#6b7280',
  backgroundColor: '#fffbeb',
  borderRadius: '6px',
  padding: '12px 16px',
  border: '1px solid #fde68a',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const footer = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#9ca3af',
  textAlign: 'center' as const,
};

export default PasswordResetEmail;
