import { ApiError, CheckoutPaymentIntent, Client, Environment, LogLevel, OrdersController } from "@paypal/paypal-server-sdk";
  
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
  
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are missing in environment variables.");
  }
  
  const client = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: PAYPAL_CLIENT_ID,
      oAuthClientSecret: PAYPAL_CLIENT_SECRET,
    },
    timeout: 0,
    environment: Environment.Sandbox,
    logging: {
      logLevel: LogLevel.Info,
      logRequest: { logBody: true },
      logResponse: { logHeaders: true },
    },
  });
  
  const ordersController = new OrdersController(client);
  
  export const createOrder = async (
    cart: any
  ): Promise<{ jsonResponse: any; httpStatusCode: number }> => {
    const collect = {
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            amount: {
              currencyCode: cart.currency,
              value: cart.total,
            },
          },
        ],
      },
      prefer: "return=minimal",
    };
  
    try {
      const { body, ...httpResponse } = await ordersController.createOrder(collect);
      console.log("Order created successfully:", body);
      return {
        jsonResponse: typeof body === "string" ? JSON.parse(body) : body,
        httpStatusCode: httpResponse.statusCode,
      };
      

    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.message);
      }
      throw error;
    }
  };
  
  export const captureOrder = async (
    orderID: string
  ): Promise<{ jsonResponse: any; httpStatusCode: number }> => {
    const collect = {
      id: orderID,
      prefer: "return=minimal",
    };
  
    try {
      const { body, ...httpResponse } = await ordersController.captureOrder(collect);
      console.log("Order captured successfully:", body);
      return {
        jsonResponse: typeof body === "string" ? JSON.parse(body) : body,
        httpStatusCode: httpResponse.statusCode,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.message);
      }
      throw error;
    }
  };
  