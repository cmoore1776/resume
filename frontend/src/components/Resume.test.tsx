import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Resume from './Resume';

describe('Resume Component', () => {
  it('should render the resume header', () => {
    render(<Resume />);
    expect(screen.getByText('Christian Moore')).toBeInTheDocument();
  });

  it('should render contact information', () => {
    render(<Resume />);
    // Check for email link
    const emailLink = screen.getByText('christian@christianmoore.me');
    expect(emailLink).toBeInTheDocument();
  });

  it('should render experience section', () => {
    render(<Resume />);
    expect(screen.getByText(/experience/i)).toBeInTheDocument();
  });

  it('should render professional summary section', () => {
    render(<Resume />);
    expect(screen.getByText(/professional summary/i)).toBeInTheDocument();
  });

  it('should render skills section', () => {
    render(<Resume />);
    expect(screen.getByText(/technical skills/i)).toBeInTheDocument();
  });
});
