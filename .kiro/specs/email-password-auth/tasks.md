# Implementation Plan

- [x] 1. Set up Shadcn UI components


  - Initialize Shadcn UI if not already done
  - Add required components: button, input, label, form
  - _Requirements: All UI requirements_

- [x] 2. Create validation schemas


- [x] 2.1 Create lib/validation.ts with Zod schemas

  - Implement signInSchema (email, password)
  - Implement signUpSchema (email, password, confirmPassword with strength rules)
  - Export TypeScript types from schemas
  - _Requirements: 1.4, 1.5, 2.4_

- [ ]* 2.2 Write property test for password validation
  - **Property 2: Short passwords are rejected**
  - **Validates: Requirements 1.4**

- [ ]* 2.3 Write property test for password confirmation
  - **Property 3: Mismatched passwords are rejected**
  - **Validates: Requirements 1.5**


- [ ] 3. Update auth service with email/password functions
- [x] 3.1 Add signUpWithEmail function to services/auth.service.ts


  - Implement email/password sign-up with Supabase
  - Add password strength validation
  - Return structured ServiceResult with proper error types
  - _Requirements: 1.2, 1.3, 5.2, 5.3_




- [ ] 3.2 Add signInWithEmail function to services/auth.service.ts
  - Implement email/password sign-in with Supabase
  - Handle invalid credentials gracefully
  - Return structured ServiceResult
  - _Requirements: 2.2, 2.3, 5.2, 5.3_

- [ ]* 3.3 Write property test for sign-up
  - **Property 1: Valid sign-up creates account**
  - **Validates: Requirements 1.2**

- [ ]* 3.4 Write property test for sign-in
  - **Property 4: Valid sign-in authenticates user**
  - **Validates: Requirements 2.2**

- [ ]* 3.5 Write property test for session storage
  - **Property 5: Successful authentication stores session**
  - **Validates: Requirements 2.5**

- [ ]* 3.6 Write property test for service error structure
  - **Property 13: Service errors are structured**



  - **Validates: Requirements 5.3**


- [ ] 4. Create SignInForm component
- [ ] 4.1 Create components/auth/SignInForm.tsx
  - Build form using Shadcn Form, Input, Button, Label components
  - Integrate React Hook Form with Zod validation
  - Implement password visibility toggle with Eye/EyeOff icons
  - Handle form submission and call signInWithEmail service
  - Display validation and authentication errors
  - Add link to sign-up page
  - Redirect to main page on success
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.4, 6.5, 7.1, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 4.2 Write property test for password toggle
  - **Property 16: Password toggle reveals text**
  - **Property 17: Password toggle is reversible**
  - **Validates: Requirements 8.2, 8.3**

- [ ]* 4.3 Write property test for icon state
  - **Property 18: Icon matches visibility state**
  - **Validates: Requirements 8.4, 8.5**

- [ ]* 4.4 Write property test for error display
  - **Property 14: Validation errors display correctly**
  - **Validates: Requirements 6.4**



- [ ]* 4.5 Write property test for error clearing
  - **Property 15: Success clears errors**
  - **Validates: Requirements 6.5**


- [ ] 5. Create SignUpForm component
- [x] 5.1 Create components/auth/SignUpForm.tsx

  - Build form using Shadcn components
  - Add email, password, and confirm password fields
  - Integrate React Hook Form with Zod validation
  - Implement password visibility toggles for both password fields
  - Handle form submission and call signUpWithEmail service
  - Display validation errors (password strength, mismatch, duplicate email)
  - Add link to sign-in page
  - Redirect to main page on success
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.2, 6.4, 6.5, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5_


- [ ] 6. Update login page
- [x] 6.1 Update app/(auth)/login/page.tsx


  - Replace Google OAuth button with SignInForm component
  - Remove Google sign-in logic
  - Keep session check logic
  - Update page title and description

  - _Requirements: 2.1, 2.2, 3.1_

- [ ] 7. Create sign-up page
- [x] 7.1 Create app/(auth)/signup/page.tsx


  - Create new page with SignUpForm component
  - Add session check (redirect if already authenticated)
  - Match styling with login page
  - _Requirements: 1.1, 1.6, 3.1_

- [ ] 8. Test session management
- [ ]* 8.1 Write property test for session persistence
  - **Property 6: Session persists across page refresh**
  - **Property 7: Session persists across browser restart**
  - **Validates: Requirements 3.1, 3.3**

- [ ]* 8.2 Write property test for route protection
  - **Property 8: Unauthenticated access redirects to sign-in**
  - **Validates: Requirements 3.5**


- [ ] 9. Test sign-out functionality
- [ ]* 9.1 Write property test for sign-out
  - **Property 9: Sign-out terminates session**
  - **Property 10: Sign-out clears cached data**
  - **Property 11: Sign-out removes tokens**

  - **Validates: Requirements 4.1, 4.2, 4.5**

- [x] 10. Clean up Google OAuth code


- [ ] 10.1 Remove Google OAuth implementation
  - Remove signInWithGoogle function from services/auth.service.ts
  - Remove Google OAuth callback handling if no longer needed
  - Remove Google OAuth environment variables from documentation
  - _Requirements: All (cleanup)_

- [x] 11. Final checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.
