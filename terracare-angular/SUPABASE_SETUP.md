# TerraCare Supabase Backend Setup Guide

## Overview

This application now includes a complete Supabase backend integration for user authentication and profile management. The implementation includes:

- User signup and authentication
- Email/password login
- Password reset functionality
- User profile management
- Route protection with guards
- Real-time session management

## Supabase Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new account or sign in
3. Click "New Project"
4. Fill in your project details:
   - Project name: `terracare-app`
   - Database password: (choose a strong password)
   - Region: (select closest to your users)

### 2. Get Your Supabase Credentials

After project creation:
1. Go to Settings → API
2. Copy your `Project URL`
3. Copy your `anon/public` API key

### 3. Configure Environment Variables

Update the environment files with your Supabase credentials:

**src/environments/environment.ts:**
```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'YOUR_SUPABASE_PROJECT_URL',
    key: 'YOUR_SUPABASE_ANON_KEY'
  }
};
```

**src/environments/environment.prod.ts:**
```typescript
export const environment = {
  production: true,
  supabase: {
    url: 'YOUR_SUPABASE_PROJECT_URL',
    key: 'YOUR_SUPABASE_ANON_KEY'
  }
};
```

### 4. Set Up Database Tables

Execute these SQL commands in the Supabase SQL Editor:

```sql
-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
CREATE POLICY "Public profiles are viewable by everyone."
  ON profiles FOR SELECT
  USING ( true );

CREATE POLICY "Users can insert their own profile."
  ON profiles FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can update own profile."
  ON profiles FOR UPDATE
  USING ( auth.uid() = user_id );

-- Create storage bucket for avatars (optional)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true);

-- Create storage policies
CREATE POLICY "Avatar images are publicly accessible."
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can upload an avatar."
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'avatars' );

CREATE POLICY "Anyone can update their own avatar."
  ON storage.objects FOR UPDATE
  USING ( auth.uid()::text = (storage.foldername(name))[1] );
```

### 5. Configure Authentication Settings

In Supabase Dashboard:
1. Go to Authentication → Settings
2. Configure Site URL: `http://localhost:4200` (for development)
3. Add redirect URLs for production deployment
4. Configure email templates (optional)
5. Enable email confirmations if desired

## Application Architecture

### Services

1. **SupabaseService** (`core/services/supabase.service.ts`)
   - Initializes Supabase client
   - Provides typed database interface
   - Manages connections

2. **AuthService** (`core/services/auth.service.ts`)
   - Handles user authentication
   - Manages session state
   - Provides reactive auth state

3. **UserService** (`core/services/user.service.ts`)
   - Manages user profiles
   - Handles CRUD operations
   - Avatar upload functionality

### Guards

1. **AuthGuard** (`core/guards/auth.guard.ts`)
   - Protects authenticated routes
   - Redirects to login if not authenticated

2. **GuestGuard** (`core/guards/guest.guard.ts`)
   - Protects guest-only routes (login, signup)
   - Redirects to dashboard if already authenticated

### Models

- **auth.model.ts**: Authentication-related interfaces
- **database.model.ts**: Database operation interfaces

## Features Implemented

### User Authentication
- ✅ Email/password signup with validation
- ✅ Email/password login
- ✅ Password reset via email
- ✅ Session management
- ✅ Automatic logout handling

### User Profile Management
- ✅ Profile creation on signup
- ✅ Profile data retrieval
- ✅ Profile updates
- ✅ Avatar upload (if storage is configured)

### Route Protection
- ✅ Protected routes for authenticated users
- ✅ Guest-only routes for unauthenticated users
- ✅ Automatic redirects

### UI Features
- ✅ Loading states for all forms
- ✅ Error message handling
- ✅ Success message feedback
- ✅ Form validation
- ✅ Responsive navbar with auth state

## Testing the Implementation

### 1. Start the Development Server

```bash
npm start
```

### 2. Test User Registration

1. Navigate to `/signup`
2. Fill in the form with valid data
3. Check for success message
4. Verify profile creation in Supabase dashboard

### 3. Test User Login

1. Navigate to `/login`
2. Use credentials from registration
3. Verify redirect to dashboard
4. Check navbar shows user info and logout option

### 4. Test Route Protection

1. Try accessing `/dashboard` without authentication
2. Should redirect to `/login`
3. Login and try accessing `/login` again
4. Should redirect to `/dashboard`

### 5. Test Password Reset

1. Navigate to `/forgot-password`
2. Enter registered email address
3. Check email for reset link
4. Follow reset process

## Deployment Considerations

### Production Environment

1. Update `environment.prod.ts` with production Supabase URL
2. Configure production domain in Supabase auth settings
3. Set up proper CORS policies
4. Enable email confirmations for security

### Security Best Practices

1. **Row Level Security**: Already implemented on profiles table
2. **API Key Security**: Keep anon key public, never expose service key
3. **HTTPS**: Always use HTTPS in production
4. **Email Verification**: Consider enabling for production

### Monitoring

1. Monitor auth usage in Supabase dashboard
2. Set up logging for authentication errors
3. Monitor database performance

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure domain is added to Supabase auth settings
2. **Email Not Sending**: Check Supabase email provider configuration
3. **Database Errors**: Verify RLS policies are correctly set up
4. **Session Issues**: Clear browser storage and cookies

### Debug Mode

Enable console logging in AuthService for debugging:
```typescript
console.log('Auth state changed:', event, session);
```

## Next Steps

Potential enhancements:
1. Social authentication (Google, GitHub, etc.)
2. Multi-factor authentication
3. User roles and permissions
4. Real-time features with Supabase subscriptions
5. Advanced profile features
6. Email verification flow
7. Account deletion functionality

## Support

For Supabase-specific issues, refer to:
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Angular with Supabase](https://supabase.com/docs/guides/getting-started/tutorials/with-angular)