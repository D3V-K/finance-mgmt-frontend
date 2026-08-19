import { Amplify } from 'aws-amplify'

const { VITE_USER_POOL_ID, VITE_USER_POOL_CLIENT_ID } = import.meta.env

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: VITE_USER_POOL_ID,
      userPoolClientId: VITE_USER_POOL_CLIENT_ID,
    },
  },
})
