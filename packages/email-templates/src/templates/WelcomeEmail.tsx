import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface WelcomeEmailProps {
  userName: string;
  userEmail: string;
  loginUrl: string;
  organizationName?: string;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  userName,
  userEmail,
  loginUrl,
  organizationName,
}) => {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Marketing AI Assistant — your AI-powered marketing platform</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>Marketing AI</Text>
          </Section>

          <Section style={contentSection}>
            <Heading style={heading}>Welcome, {userName}! 🎉</Heading>
            <Text style={paragraph}>
              Thank you for joining Marketing AI Assistant. Your account has been successfully
              created{organizationName ? ` for ${organizationName}` : ''}.
            </Text>
            <Text style={paragraph}>
              You now have access to AI-powered tools to automate your marketing:
            </Text>
            <ul style={list}>
              <li>📝 Generate high-quality content with AI</li>
              <li>📧 Manage email campaigns</li>
              <li>✅ Track marketing checklists</li>
              <li>📄 Auto-generate marketing documents</li>
              <li>💬 Chat with your AI marketing assistant</li>
            </ul>

            <Section style={buttonSection}>
              <Button style={button} href={loginUrl}>
                Get Started →
              </Button>
            </Section>

            <Hr style={hr} />

            <Text style={footer}>
              You&apos;re receiving this email because you created an account with {userEmail}.
              <br />
              <Link href={`${loginUrl}/settings`} style={link}>
                Manage preferences
              </Link>
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

const list = {
  fontSize: '16px',
  lineHeight: '28px',
  color: '#4a5568',
  paddingLeft: '20px',
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

const link = {
  color: '#5b21b6',
  textDecoration: 'underline',
};

export default WelcomeEmail;
