# Deploying SpaceChat.live to Railway

This guide explains how to deploy SpaceChat.live to Railway platform.

## Prerequisites

- A [Railway](https://railway.app/) account
- Git installed on your computer
- Basic knowledge of command line

## Deployment Steps

### 1. Fork and Clone the Repository

First, fork the repository to your GitHub account, then clone it to your local machine:

```bash
git clone https://github.com/yourusername/spacechat-live.git
cd spacechat-live
```

### 2. Push to Railway

Use Railway CLI or connect your GitHub repository through the Railway dashboard.

#### Using Railway CLI:

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Link your local project to Railway:
```bash
railway link
```

4. Deploy the project:
```bash
railway up
```

#### Using Railway Dashboard:

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project" > "Deploy from GitHub repo"
3. Select your forked SpaceChat.live repository
4. Railway will automatically detect the configuration and deploy your app

### 3. Set Environment Variables

In the Railway dashboard, add the following environment variables:

- `NODE_ENV`: `production`
- `PORT`: Will be set automatically by Railway
- `CLIENT_URL`: If you have a custom domain (optional)

### 4. Configure Domain (Optional)

1. In your project settings on Railway, go to the "Domains" section
2. Add a custom domain or use the provided Railway subdomain

## Configuration Files

The project includes the following configuration files for Railway:

- `railway.toml`: Main Railway configuration
- `nixpacks.toml`: Build configuration
- `Procfile`: Process definition

## Troubleshooting

If you encounter issues:

1. Check the logs in Railway dashboard
2. Make sure all environment variables are set correctly
3. Verify that the build process completes successfully

## Local Testing

To test the production build locally before deploying:

```bash
npm run install:all
npm run build
npm run start:prod
```

Your application should now be running on Railway! 